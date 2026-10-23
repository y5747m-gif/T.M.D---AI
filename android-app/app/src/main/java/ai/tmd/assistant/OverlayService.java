package ai.tmd.assistant;

import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.Locale;

/**
 * خدمة الفقاعة العائمة فوق النظام (AURA System Bubble):
 * 1) نافذة إضاءة محيطة بحدود الشاشة بالكامل (AmbientEdgeGlowView) غير قابلة للمس.
 * 2) نافذة الفقاعة / شريط الكتابة السفلي الشفاف، بحيث تبقى بقية شاشة الهاتف مرئية وقابلة للمس.
 * 3) بث مباشر للشاشة مع الذكاء الاصطناعي عبر MediaProjection + نطق عربي أصلي عبر TextToSpeech.
 */
public class OverlayService extends Service {
    public static final String ACTION_SHOW = "ai.tmd.assistant.SHOW";
    public static final String ACTION_OPEN_DOCK = "ai.tmd.assistant.OPEN_DOCK";
    public static final String ACTION_CAPTURE = "ai.tmd.assistant.CAPTURE";
    public static final String ACTION_STOP = "ai.tmd.assistant.STOP";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";

    private static final String PREFS_NAME = "tmd_bubble_prefs";
    private static final String PREF_BUBBLE_ACTIVE = "bubble_active";
    private static final String CHANNEL = "tmd_assistant";
    private static final int NOTIFICATION_ID = 7;
    private static final int COMPACT_DP = 76;
    private static final int DEFAULT_DOCK_DP = 168;
    private static final long MIN_FRAME_INTERVAL_MS = 380L;

    private static OverlayService instance;

    private WindowManager windowManager;
    private AmbientEdgeGlowView edgeGlowView;
    private FrameLayout overlay;
    private WebView web;
    private WindowManager.LayoutParams params;
    private boolean expanded;
    private boolean webLoaded;
    private boolean pendingOpenDock;
    private int dockHeightDp = DEFAULT_DOCK_DP;
    private int compactX;
    private int compactY;

    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader reader;
    private HandlerThread captureThread;
    private volatile String latestScreenshot;
    private volatile long latestFrameTimestamp;
    private volatile long lastEncodedAt;
    private final Object sigLock = new Object();
    private byte[] latestSig16;
    private byte[] baselineSig16;

    private TextToSpeech tts;
    private volatile boolean ttsReady;

    public static void setBubbleEnabledPref(Context context, boolean active) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putBoolean(PREF_BUBBLE_ACTIVE, active).apply();
    }

    public static boolean isBubbleEnabledPref(Context context) {
        if (context == null) return false;
        return context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getBoolean(PREF_BUBBLE_ACTIVE, false);
    }

    public static boolean isRunning() {
        return instance != null && instance.overlay != null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        startAssistantForeground(false);
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        initTextToSpeech();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_SHOW : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            setBubbleEnabledPref(this, false);
            stopSelf();
            return START_NOT_STICKY;
        }
        setBubbleEnabledPref(this, true);
        if (ACTION_CAPTURE.equals(action)) {
            showOverlay();
            Intent data = getResultData(intent);
            startCapture(intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED), data);
        } else if (ACTION_OPEN_DOCK.equals(action)) {
            showOverlay();
            openDockFromNative();
        } else {
            showOverlay();
        }
        return START_STICKY;
    }

    private void openDockFromNative() {
        if (webLoaded) {
            callJs("window.tmdAndroidOpenDock&&window.tmdAndroidOpenDock()");
        } else {
            pendingOpenDock = true;
        }
    }

    private void initTextToSpeech() {
        try {
            tts = new TextToSpeech(getApplicationContext(), status -> {
                if (status == TextToSpeech.SUCCESS && tts != null) {
                    int langResult = tts.setLanguage(Locale.forLanguageTag("ar-SA"));
                    if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                        tts.setLanguage(new Locale("ar"));
                    }
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String utteranceId) {
                            callJs("window.tmdAndroidSpeechStarted&&window.tmdAndroidSpeechStarted()");
                        }

                        @Override public void onDone(String utteranceId) {
                            callJs("window.tmdAndroidSpeechEnded&&window.tmdAndroidSpeechEnded()");
                        }

                        @Override @SuppressWarnings("deprecation")
                        public void onError(String utteranceId) {
                            callJs("window.tmdAndroidSpeechEnded&&window.tmdAndroidSpeechEnded()");
                        }
                    });
                    ttsReady = true;
                }
            });
        } catch (Exception ignored) {
            ttsReady = false;
        }
    }

    @SuppressWarnings("deprecation")
    private Intent getResultData(Intent source) {
        return source == null ? null : (Intent) source.getParcelableExtra(EXTRA_RESULT_DATA);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("يبقي الفقاعة الذكية والبث المباشر للشاشة جاهزين فوق التطبيقات");
        channel.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification notification(boolean sharing) {
        Intent manage = new Intent(this, MainActivity.class)
                .setAction(MainActivity.ACTION_MANAGE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent managePending = PendingIntent.getActivity(this, 0, manage,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Intent openDock = new Intent(this, OverlayService.class).setAction(ACTION_OPEN_DOCK);
        PendingIntent openDockPending = PendingIntent.getService(this, 2, openDock,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Intent stop = new Intent(this, OverlayService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 1, stop,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(getString(R.string.notification_title))
                .setContentText(sharing
                        ? "البث المباشر للشاشة نشط — الذكاء الاصطناعي يرى شاشتك الآن"
                        : "اضغط على الفقاعة العائمة في أي وقت للإضاءة والتحدث")
                .setContentIntent(managePending)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_btn_speak_now,
                        getString(R.string.open_dock),
                        openDockPending).build())
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_close_clear_cancel,
                        getString(R.string.stop_assistant),
                        stopPending).build());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        }
        return builder.build();
    }

    private void startAssistantForeground(boolean sharing) {
        Notification note = notification(sharing);
        if (Build.VERSION.SDK_INT >= 34) {
            int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            if (sharing) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
            startForeground(NOTIFICATION_ID, note, type);
        } else {
            startForeground(NOTIFICATION_ID, note);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showOverlay() {
        if (!Settings.canDrawOverlays(this)) return;

        // 1) نافذة الإضاءة المحيطة بحواف الشاشة بالكامل (لا تعترض أي لمسة)
        if (edgeGlowView == null) {
            edgeGlowView = new AmbientEdgeGlowView(this);
            WindowManager.LayoutParams glowParams = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                            | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                    PixelFormat.TRANSLUCENT);
            glowParams.gravity = Gravity.TOP | Gravity.START;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                glowParams.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }
            windowManager.addView(edgeGlowView, glowParams);
        }

        if (overlay != null) return;

        // 2) نافذة الفقاعة العائمة وشريط الكتابة السفلي الشفاف
        overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.TRANSPARENT);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        web.setWebViewClient(new LocalAssistantWebClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "TmdAndroid");
        web.loadUrl("https://t-m-d-ai.vercel.app/__tmd-local/assistant.html?android=1");
        overlay.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        params = new WindowManager.LayoutParams(
                dp(COMPACT_DP), dp(COMPACT_DP),
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                PixelFormat.TRANSLUCENT);
        params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        compactX = dp(10);
        compactY = dp(88);
        applyOverlaySize(false, false);
        windowManager.addView(overlay, params);
    }

    private class LocalAssistantWebClient extends WebViewClient {
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            webLoaded = true;
            if (pendingOpenDock) {
                pendingOpenDock = false;
                callJs("window.tmdAndroidOpenDock&&window.tmdAndroidOpenDock()");
            }
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            WebResourceResponse local = localAsset(request == null ? null : request.getUrl());
            return local != null ? local : super.shouldInterceptRequest(view, request);
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            WebResourceResponse local = localAsset(url == null ? null : Uri.parse(url));
            return local != null ? local : super.shouldInterceptRequest(view, url);
        }
    }

    private WebResourceResponse localAsset(Uri uri) {
        if (uri == null || !"t-m-d-ai.vercel.app".equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith("/__tmd-local/")) return null;
        String file = path.substring("/__tmd-local/".length());
        if (!("assistant.html".equals(file)
                || "floating-assistant.css".equals(file)
                || "floating-assistant.js".equals(file)
                || "aura-bubble-logo.svg".equals(file))) {
            return null;
        }
        try {
            InputStream stream = getAssets().open(file);
            String mime = file.endsWith(".css") ? "text/css"
                    : file.endsWith(".js") ? "application/javascript"
                    : file.endsWith(".svg") ? "image/svg+xml" : "text/html";
            return new WebResourceResponse(mime, "UTF-8", stream);
        } catch (IOException ignored) {
            return null;
        }
    }

    private void setExpanded(boolean shouldExpand) {
        if (overlay == null || params == null) return;
        applyOverlaySize(shouldExpand, true);
    }

    private void updateDockHeightDp(int requestedDp) {
        int clamped = Math.max(124, Math.min(540, requestedDp));
        if (Math.abs(clamped - dockHeightDp) < 4) return;
        dockHeightDp = clamped;
        if (expanded && overlay != null && params != null) {
            applyOverlaySize(true, true);
        }
    }

    private void applyOverlaySize(boolean shouldExpand, boolean update) {
        expanded = shouldExpand;
        DisplayMetrics display = Resources.getSystem().getDisplayMetrics();
        if (shouldExpand) {
            int maxHeight = Math.round(display.heightPixels * 0.66f);
            params.width = display.widthPixels;
            params.height = Math.min(dp(dockHeightDp), maxHeight);
            params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            params.x = 0;
            params.y = 0;
            // يسمح بظهور لوحة مفاتيح الهاتف عند الكتابة في الأسفل، مع تمرير أي لمسة أعلى الشريط للتطبيق المفتوح
            params.flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                    | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED;
        } else {
            params.width = dp(COMPACT_DP);
            params.height = dp(COMPACT_DP);
            params.gravity = Gravity.BOTTOM | Gravity.END;
            params.x = compactX;
            params.y = compactY;
            // الفقاعة المصغرة لا تسرق زر الرجوع أو لوحة المفاتيح من تطبيقات الهاتف الأخرى
            params.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                    | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                    | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED;
        }
        if (update && overlay != null) {
            try {
                windowManager.updateViewLayout(overlay, params);
            } catch (IllegalArgumentException ignored) { }
        }
    }

    private void moveCompactBubble(float dx, float dy) {
        if (expanded || overlay == null || params == null) return;
        DisplayMetrics display = Resources.getSystem().getDisplayMetrics();
        compactX = Math.max(0, Math.min(display.widthPixels - dp(COMPACT_DP), compactX - Math.round(dx)));
        compactY = Math.max(dp(24), Math.min(display.heightPixels - dp(COMPACT_DP + 24), compactY - Math.round(dy)));
        params.x = compactX;
        params.y = compactY;
        try { windowManager.updateViewLayout(overlay, params); }
        catch (IllegalArgumentException ignored) { }
    }

    private void snapCompactBubbleToEdge() {
        if (expanded || overlay == null || params == null) return;
        DisplayMetrics display = Resources.getSystem().getDisplayMetrics();
        int maxRightOffset = Math.max(0, display.widthPixels - dp(COMPACT_DP) - dp(8));
        int targetX = (compactX > display.widthPixels / 2 - dp(COMPACT_DP) / 2) ? maxRightOffset : dp(8);
        ValueAnimator snap = ValueAnimator.ofInt(compactX, targetX);
        snap.setDuration(230);
        snap.setInterpolator(new DecelerateInterpolator());
        snap.addUpdateListener(anim -> {
            if (expanded || overlay == null || params == null) return;
            compactX = (int) anim.getAnimatedValue();
            params.x = compactX;
            try { windowManager.updateViewLayout(overlay, params); }
            catch (IllegalArgumentException ignored) { }
        });
        snap.start();
    }

    /* ============ البث المباشر للشاشة مع الذكاء الاصطناعي ============ */
    private void startCapture(int resultCode, Intent data) {
        stopCapture();
        if (resultCode != Activity.RESULT_OK || data == null) {
            callJs("window.tmdAndroidScreenShareDenied&&window.tmdAndroidScreenShareDenied()");
            return;
        }
        try {
            startAssistantForeground(true);
            MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            projection = manager.getMediaProjection(resultCode, data);
            if (projection == null) throw new SecurityException("لم نحصل على موافقة مشاركة شاشة صالحة.");

            projection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    releaseCapture(false);
                    callJs("window.tmdAndroidScreenShareStopped&&window.tmdAndroidScreenShareStopped()");
                    startAssistantForeground(false);
                }
            }, new Handler(Looper.getMainLooper()));

            DisplayMetrics dm = Resources.getSystem().getDisplayMetrics();
            int width = dm.widthPixels;
            int height = dm.heightPixels;
            reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
            captureThread = new HandlerThread("tmd-live-screen");
            captureThread.start();
            reader.setOnImageAvailableListener(this::onImage, new Handler(captureThread.getLooper()));
            virtualDisplay = projection.createVirtualDisplay(
                    "AURA Live Screen", width, height, dm.densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    reader.getSurface(), null, null);
            callJs("window.tmdAndroidScreenShareStarted&&window.tmdAndroidScreenShareStarted()");
        } catch (Exception exception) {
            releaseCapture(true);
            startAssistantForeground(false);
            callJs("window.tmdAndroidScreenShareDenied&&window.tmdAndroidScreenShareDenied()");
        }
    }

    private void onImage(ImageReader source) {
        Image image = null;
        try {
            image = source.acquireLatestImage();
            if (image == null) return;
            long now = System.currentTimeMillis();
            if (now - lastEncodedAt < MIN_FRAME_INTERVAL_MS) return;
            lastEncodedAt = now;

            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride();
            int rowStride = plane.getRowStride();
            int padding = rowStride - pixelStride * image.getWidth();

            Bitmap raw = Bitmap.createBitmap(
                    image.getWidth() + padding / pixelStride,
                    image.getHeight(), Bitmap.Config.ARGB_8888);
            raw.copyPixelsFromBuffer(buffer);
            Bitmap cropped = Bitmap.createBitmap(raw, 0, 0, image.getWidth(), image.getHeight());

            // بصمة 16×16 خفيفة جداً لكشف تغيّر المشهد أثناء البث المباشر
            Bitmap tiny = Bitmap.createScaledBitmap(cropped, 16, 16, true);
            byte[] sig = new byte[256];
            for (int y = 0; y < 16; y++) {
                for (int x = 0; x < 16; x++) {
                    int px = tiny.getPixel(x, y);
                    int r = (px >> 16) & 0xFF;
                    int g = (px >> 8) & 0xFF;
                    int b = px & 0xFF;
                    sig[y * 16 + x] = (byte) ((299 * r + 587 * g + 114 * b) / 1000);
                }
            }
            tiny.recycle();
            synchronized (sigLock) {
                latestSig16 = sig;
                if (baselineSig16 == null) baselineSig16 = sig.clone();
            }

            int targetWidth = Math.min(1080, image.getWidth());
            Bitmap scaled = targetWidth == image.getWidth() ? cropped
                    : Bitmap.createScaledBitmap(cropped, targetWidth,
                    image.getHeight() * targetWidth / image.getWidth(), true);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, 68, out);
            latestScreenshot = "data:image/jpeg;base64,"
                    + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            latestFrameTimestamp = now;

            raw.recycle();
            if (cropped != raw) cropped.recycle();
            if (scaled != cropped) scaled.recycle();
        } catch (Exception ignored) {
        } finally {
            if (image != null) image.close();
        }
    }

    private int computeFrameDiffPercent() {
        synchronized (sigLock) {
            if (latestSig16 == null || baselineSig16 == null) return 0;
            int total = 0;
            for (int i = 0; i < 256; i++) {
                int a = latestSig16[i] & 0xFF;
                int b = baselineSig16[i] & 0xFF;
                total += Math.abs(a - b);
            }
            return Math.min(100, Math.round((total / (256f * 255f)) * 100f * 2.4f));
        }
    }

    private void updateFrameBaseline() {
        synchronized (sigLock) {
            if (latestSig16 != null) {
                baselineSig16 = latestSig16.clone();
            }
        }
    }

    private void stopCapture() {
        releaseCapture(true);
        startAssistantForeground(false);
    }

    private void releaseCapture(boolean stopProjection) {
        latestScreenshot = null;
        latestFrameTimestamp = 0L;
        synchronized (sigLock) {
            latestSig16 = null;
            baselineSig16 = null;
        }
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (reader != null) {
            reader.setOnImageAvailableListener(null, null);
            reader.close();
            reader = null;
        }
        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
        }
        MediaProjection old = projection;
        projection = null;
        if (stopProjection && old != null) {
            try { old.stop(); } catch (Exception ignored) { }
        }
    }

    private void callJs(String js) {
        if (web != null) {
            web.post(() -> {
                if (web != null) web.evaluateJavascript(js, null);
            });
        }
    }

    public static void deliverPickedImage(Uri uri) {
        OverlayService service = instance;
        if (service == null || uri == null) {
            notifyImageError("الفقاعة العائمة غير جاهزة. افتحها ثم حاول مجددًا.");
            return;
        }
        new Thread(() -> service.readPickedImage(uri), "tmd-image-picker").start();
    }

    private void readPickedImage(Uri uri) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream first = getContentResolver().openInputStream(uri)) {
                BitmapFactory.decodeStream(first, null, bounds);
            }
            if (bounds.outWidth < 1 || bounds.outHeight < 1) throw new IOException("Invalid image");

            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 2400) {
                options.inSampleSize *= 2;
            }
            Bitmap bitmap;
            try (InputStream second = getContentResolver().openInputStream(uri)) {
                bitmap = BitmapFactory.decodeStream(second, null, options);
            }
            if (bitmap == null) throw new IOException("Invalid image");

            int maxSide = 1600;
            float scale = Math.min(1f, (float) maxSide / Math.max(bitmap.getWidth(), bitmap.getHeight()));
            Bitmap output = bitmap;
            if (scale < 1f) {
                output = Bitmap.createScaledBitmap(bitmap,
                        Math.max(1, Math.round(bitmap.getWidth() * scale)),
                        Math.max(1, Math.round(bitmap.getHeight() * scale)), true);
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            output.compress(Bitmap.CompressFormat.JPEG, 82, bytes);
            String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
            String name = uri.getLastPathSegment() == null ? "صورة من الهاتف" : uri.getLastPathSegment();
            callJs("window.tmdAndroidImageSelected&&window.tmdAndroidImageSelected("
                    + JSONObject.quote(dataUrl) + "," + JSONObject.quote(name) + ")");
            if (output != bitmap) output.recycle();
            bitmap.recycle();
        } catch (Exception error) {
            notifyImageError("تعذّر قراءة الصورة المختارة. جرّب صورة أخرى.");
        }
    }

    public static void notifyImageError(String message) {
        if (instance != null) instance.callJs(
                "window.tmdAndroidImageSelectionFailed&&window.tmdAndroidImageSelectionFailed("
                        + JSONObject.quote(message == null ? "تعذّر اختيار الصورة." : message) + ")");
    }

    public static void deliverVoiceText(String text) {
        if (instance != null) instance.callJs(
                "window.tmdAndroidVoiceResult&&window.tmdAndroidVoiceResult("
                        + JSONObject.quote(text == null ? "" : text) + ")");
    }

    public static void notifyVoiceError(String message) {
        if (instance != null) instance.callJs(
                "window.tmdAndroidVoiceError&&window.tmdAndroidVoiceError("
                        + JSONObject.quote(message == null ? "تعذّر التعرف على الصوت." : message) + ")");
    }

    public static void notifyPermissionError(String message) {
        if (instance != null) instance.callJs(
                "window.tmdAndroidVoiceError&&window.tmdAndroidVoiceError("
                        + JSONObject.quote(message == null ? "الصلاحية مطلوبة." : message) + ")");
    }

    public static void notifyShareDenied() {
        if (instance != null) {
            instance.callJs("window.tmdAndroidScreenShareDenied&&window.tmdAndroidScreenShareDenied()");
        }
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private class Bridge {
        @JavascriptInterface
        public void startScreenShare() {
            Intent intent = new Intent(OverlayService.this, MainActivity.class)
                    .setAction(MainActivity.ACTION_SHARE)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);
        }

        @JavascriptInterface
        public void openImagePicker() {
            Intent intent = new Intent(OverlayService.this, MainActivity.class)
                    .setAction(MainActivity.ACTION_PICK_IMAGE)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);
        }

        @JavascriptInterface
        public void startVoiceInput() {
            Intent intent = new Intent(OverlayService.this, MainActivity.class)
                    .setAction(MainActivity.ACTION_VOICE)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);
        }

        @JavascriptInterface
        public void stopScreenShare() {
            new Handler(Looper.getMainLooper()).post(() -> {
                stopCapture();
                callJs("window.tmdAndroidScreenShareStopped&&window.tmdAndroidScreenShareStopped()");
            });
        }

        @JavascriptInterface
        public void moveBubbleBy(final float dx, final float dy) {
            new Handler(Looper.getMainLooper()).post(() -> moveCompactBubble(dx, dy));
        }

        @JavascriptInterface
        public void snapBubbleToEdge() {
            new Handler(Looper.getMainLooper()).post(OverlayService.this::snapCompactBubbleToEdge);
        }

        @JavascriptInterface
        public void setOverlayExpanded(final boolean value) {
            new Handler(Looper.getMainLooper()).post(() -> setExpanded(value));
        }

        @JavascriptInterface
        public void setDockHeightDp(final int heightDp) {
            new Handler(Looper.getMainLooper()).post(() -> updateDockHeightDp(heightDp));
        }

        @JavascriptInterface
        public void setAuraState(final String auraMode) {
            new Handler(Looper.getMainLooper()).post(() -> {
                if (edgeGlowView != null) {
                    edgeGlowView.setAuraState(auraMode);
                }
            });
        }

        @JavascriptInterface
        public void speakText(final String text) {
            if (text == null || text.trim().isEmpty()) return;
            new Handler(Looper.getMainLooper()).post(() -> {
                if (tts != null && ttsReady) {
                    tts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, null, "tmd_utter_" + System.currentTimeMillis());
                }
            });
        }

        @JavascriptInterface
        public void stopSpeaking() {
            new Handler(Looper.getMainLooper()).post(() -> {
                if (tts != null) {
                    try { tts.stop(); } catch (Exception ignored) { }
                }
            });
        }

        @JavascriptInterface
        public boolean canSpeak() {
            return ttsReady;
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public String getLatestScreenshot() {
            return latestScreenshot == null ? "" : latestScreenshot;
        }

        @JavascriptInterface
        public long getLatestFrameTimestamp() {
            return latestFrameTimestamp;
        }

        @JavascriptInterface
        public int getFrameChangePercent() {
            return computeFrameDiffPercent();
        }

        @JavascriptInterface
        public void markFrameBaseline() {
            updateFrameBaseline();
        }

        @JavascriptInterface
        public boolean isScreenSharing() {
            return projection != null;
        }

        @JavascriptInterface
        public void closeAssistant() {
            new Handler(Looper.getMainLooper()).post(() -> {
                setBubbleEnabledPref(OverlayService.this, false);
                stopSelf();
            });
        }
    }

    @Override
    public void onDestroy() {
        releaseCapture(true);
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) { }
            tts = null;
            ttsReady = false;
        }
        if (edgeGlowView != null) {
            try { windowManager.removeView(edgeGlowView); } catch (IllegalArgumentException ignored) { }
            edgeGlowView = null;
        }
        if (overlay != null) {
            try { windowManager.removeView(overlay); } catch (IllegalArgumentException ignored) { }
            overlay = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
