package ai.tmd.assistant;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.Resources;
import android.graphics.Bitmap;
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
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;

/**
 * خدمة أمامية دائمة تملك نافذة Android من النوع TYPE_APPLICATION_OVERLAY.
 * حين تكون مغلقة تشغل مساحة الفقاعة فقط؛ وحين يفتحها المستخدم تتسع WebView للدردشة.
 */
public class OverlayService extends Service {
    public static final String ACTION_SHOW = "ai.tmd.assistant.SHOW";
    public static final String ACTION_CAPTURE = "ai.tmd.assistant.CAPTURE";
    public static final String ACTION_STOP = "ai.tmd.assistant.STOP";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";

    private static final String CHANNEL = "tmd_assistant";
    private static final int NOTIFICATION_ID = 7;
    private static final int COMPACT_DP = 96;
    private static final int EXPANDED_WIDTH_DP = 350;
    private static final int EXPANDED_HEIGHT_DP = 560;
    private static OverlayService instance;

    private WindowManager windowManager;
    private FrameLayout overlay;
    private WebView web;
    private WindowManager.LayoutParams params;
    private boolean expanded;

    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader reader;
    private HandlerThread captureThread;
    private volatile String latestScreenshot;

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        startAssistantForeground(false);
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_SHOW : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_CAPTURE.equals(action)) {
            showOverlay();
            Intent data = getResultData(intent);
            startCapture(intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED), data);
        } else {
            showOverlay();
        }
        // يعيد Android تشغيل الخدمة والفقاعة بعد إزالة النشاط من قائمة التطبيقات.
        return START_STICKY;
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
        channel.setDescription("يبقي المساعد العائم ومشاركة الشاشة قيد التشغيل");
        channel.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification notification(boolean sharing) {
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Intent stop = new Intent(this, OverlayService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 1, stop,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(getString(R.string.notification_title))
                .setContentText(sharing ? "مشاركة الشاشة نشطة — اضغط للإدارة" : "الفقاعة العائمة جاهزة — اضغط للإدارة")
                .setContentIntent(openPending)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_close_clear_cancel,
                        getString(R.string.stop_assistant),
                        stopPending).build());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        }
        return builder.build();
    }

    /**
     * API 34+ يطلب نوع foreground service صريحاً. نبدأ كـ special-use للفقاعة
     * التي اختار المستخدم تشغيلها، ثم نضيف mediaProjection بعد موافقته للشاشة.
     */
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
        if (overlay != null || !Settings.canDrawOverlays(this)) return;

        overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.TRANSPARENT);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.setLayerType(View.LAYER_TYPE_SOFTWARE, null);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        web.setWebViewClient(new LocalAssistantWebClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "TmdAndroid");
        // تخدم HTML/CSS/JS من APK، مع الاحتفاظ بأصل موقع الإنتاج كي يصل
        // /api/chat من دون CORS أو تعارض بين نسخة APK ونسخة الويب المنشورة.
        web.loadUrl("https://t-m-d-ai.vercel.app/__tmd-local/assistant.html?android=1");
        overlay.addView(web, new FrameLayout.LayoutParams(-1, -1));

        params = new WindowManager.LayoutParams(
                dp(COMPACT_DP), dp(COMPACT_DP),
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        applyOverlaySize(false, false);
        windowManager.addView(overlay, params);
    }

    /**
     * يعترض ثلاثة ملفات ثابتة فقط من APK. تظل بقية عناوين نطاق الإنتاج (ومنها
     * /api/chat) شبكية، لذلك لا تنكشف مفاتيح API داخل التطبيق ولا نحتاج CORS.
     */
    private class LocalAssistantWebClient extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            WebResourceResponse local = localAsset(request == null ? null : request.getUrl());
            return local != null ? local : super.shouldInterceptRequest(view, request);
        }

        @Override @SuppressWarnings("deprecation")
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
                || "floating-assistant.js".equals(file))) return null;
        try {
            InputStream stream = getAssets().open(file);
            String mime = file.endsWith(".css") ? "text/css"
                    : file.endsWith(".js") ? "application/javascript" : "text/html";
            return new WebResourceResponse(mime, "UTF-8", stream);
        } catch (IOException ignored) {
            return null;
        }
    }

    /** Called from JavaScript only on the main thread. */
    private void setExpanded(boolean shouldExpand) {
        if (overlay == null || params == null) return;
        applyOverlaySize(shouldExpand, true);
    }

    private void applyOverlaySize(boolean shouldExpand, boolean update) {
        expanded = shouldExpand;
        DisplayMetrics display = Resources.getSystem().getDisplayMetrics();
        if (shouldExpand) {
            params.width = Math.min(dp(EXPANDED_WIDTH_DP), display.widthPixels - dp(16));
            params.height = Math.min(dp(EXPANDED_HEIGHT_DP), display.heightPixels - dp(28));
            params.gravity = Gravity.CENTER_VERTICAL | Gravity.END;
            params.x = dp(8);
            params.y = 0;
        } else {
            params.width = dp(COMPACT_DP);
            params.height = dp(COMPACT_DP);
            params.gravity = Gravity.BOTTOM | Gravity.END;
            params.x = dp(8);
            params.y = dp(72);
        }
        if (update && overlay != null) {
            try { windowManager.updateViewLayout(overlay, params); }
            catch (IllegalArgumentException ignored) { /* الخدمة أزيلت للتو */ }
        }
    }

    private void startCapture(int resultCode, Intent data) {
        stopCapture();
        if (resultCode != Activity.RESULT_OK || data == null) {
            callJs("window.tmdAndroidScreenShareDenied&&window.tmdAndroidScreenShareDenied()");
            return;
        }
        try {
            // حدثت هذه الترقية بعد موافقة المستخدم في شاشة Android الرسمية.
            startAssistantForeground(true);
            MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            projection = manager.getMediaProjection(resultCode, data);
            if (projection == null) throw new SecurityException("لم نحصل على موافقة مشاركة شاشة صالحة.");

            projection.registerCallback(new MediaProjection.Callback() {
                @Override public void onStop() {
                    releaseCapture(false);
                    callJs("window.tmdAndroidScreenShareStopped&&window.tmdAndroidScreenShareStopped()");
                    startAssistantForeground(false);
                }
            }, new Handler(Looper.getMainLooper()));

            DisplayMetrics dm = Resources.getSystem().getDisplayMetrics();
            int width = dm.widthPixels;
            int height = dm.heightPixels;
            reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
            captureThread = new HandlerThread("tmd-screen-capture");
            captureThread.start();
            reader.setOnImageAvailableListener(this::onImage, new Handler(captureThread.getLooper()));
            virtualDisplay = projection.createVirtualDisplay(
                    "TMD screen", width, height, dm.densityDpi,
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
            int targetWidth = Math.min(1080, image.getWidth());
            Bitmap scaled = targetWidth == image.getWidth() ? cropped
                    : Bitmap.createScaledBitmap(cropped, targetWidth,
                    image.getHeight() * targetWidth / image.getWidth(), true);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, 68, out);
            latestScreenshot = "data:image/jpeg;base64,"
                    + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);

            raw.recycle();
            if (cropped != raw) cropped.recycle();
            if (scaled != cropped) scaled.recycle();
        } catch (Exception ignored) {
            // قد يصل إطار واحد أثناء إغلاق ImageReader؛ ننتظر الإطار التالي.
        } finally {
            if (image != null) image.close();
        }
    }

    private void stopCapture() {
        releaseCapture(true);
        startAssistantForeground(false);
    }

    /**
     * لا نستدعي projection.stop من MediaProjection.Callback نفسه كي لا نعيد
     * استدعاء callback بشكل دائري.
     */
    private void releaseCapture(boolean stopProjection) {
        latestScreenshot = null;
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
        if (web != null) web.post(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
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
        @JavascriptInterface public void startScreenShare() {
            Intent intent = new Intent(OverlayService.this, MainActivity.class)
                    .setAction(MainActivity.ACTION_SHARE)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);
        }

        @JavascriptInterface public void stopScreenShare() {
            new Handler(Looper.getMainLooper()).post(() -> {
                stopCapture();
                callJs("window.tmdAndroidScreenShareStopped&&window.tmdAndroidScreenShareStopped()");
            });
        }

        @JavascriptInterface public void setOverlayExpanded(final boolean value) {
            new Handler(Looper.getMainLooper()).post(() -> setExpanded(value));
        }

        @JavascriptInterface public boolean isNativeApp() { return true; }

        @JavascriptInterface public String getLatestScreenshot() {
            return latestScreenshot == null ? "" : latestScreenshot;
        }

        @JavascriptInterface public boolean isScreenSharing() { return projection != null; }

        @JavascriptInterface public void closeAssistant() {
            new Handler(Looper.getMainLooper()).post(OverlayService.this::stopSelf);
        }
    }

    @Override public void onDestroy() {
        releaseCapture(true);
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

    @Override public IBinder onBind(Intent intent) { return null; }
}
