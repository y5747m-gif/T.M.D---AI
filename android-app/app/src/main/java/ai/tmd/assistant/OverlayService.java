package ai.tmd.assistant;

import android.annotation.SuppressLint;
import android.app.*;
import android.content.*;
import android.content.res.Resources;
import android.graphics.*;
import android.hardware.display.DisplayManager;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.*;
import android.provider.Settings;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

public class OverlayService extends Service {
    public static final String ACTION_SHOW = "show", ACTION_CAPTURE = "capture";
    public static final String EXTRA_RESULT_CODE = "resultCode", EXTRA_RESULT_DATA = "resultData";
    private static final String CHANNEL = "tmd_assistant";
    private static OverlayService instance;
    private WindowManager windowManager;
    private FrameLayout overlay;
    private WebView web;
    private WindowManager.LayoutParams params;
    private MediaProjection projection;
    private ImageReader reader;
    private HandlerThread captureThread;
    private volatile String latestScreenshot;

    @Override public void onCreate() {
        super.onCreate(); instance = this; createChannel(); startForeground(7, notification());
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent == null || ACTION_SHOW.equals(intent.getAction())) showOverlay();
        if (ACTION_CAPTURE.equals(intent.getAction())) {
            showOverlay();
            Intent data = intent.getParcelableExtra(EXTRA_RESULT_DATA);
            startCapture(intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED), data);
        }
        return START_STICKY;
    }

    private void createChannel() {
        NotificationChannel c = new NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW);
        c.setDescription("يبقي المساعد العائم ومشاركة الشاشة قيد التشغيل");
        getSystemService(NotificationManager.class).createNotificationChannel(c);
    }

    private Notification notification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(getString(R.string.notification_title)).setContentText("اضغط للفتح أو لإدارة مشاركة الشاشة")
                .setContentIntent(pending).setOngoing(true).build();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showOverlay() {
        if (overlay != null || !Settings.canDrawOverlays(this)) return;
        overlay = new FrameLayout(this); overlay.setBackgroundColor(Color.TRANSPARENT);
        web = new WebView(this);
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient()); web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "TmdAndroid");
        web.loadUrl("https://t-m-d-ai.vercel.app/assistant.html?android=1");
        overlay.addView(web, new FrameLayout.LayoutParams(-1, -1));

        int width = Math.min(dp(390), Resources.getSystem().getDisplayMetrics().widthPixels - dp(20));
        int height = Math.min(dp(650), Resources.getSystem().getDisplayMetrics().heightPixels - dp(80));
        params = new WindowManager.LayoutParams(width, height,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.END; params.x = dp(10); params.y = dp(55);
        overlay.setOnTouchListener(new DragTouch());
        windowManager.addView(overlay, params);
    }

    private void startCapture(int resultCode, Intent data) {
        stopCapture();
        if (resultCode != Activity.RESULT_OK || data == null) { callJs("window.tmdAndroidScreenShareDenied&&window.tmdAndroidScreenShareDenied()"); return; }
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        projection = manager.getMediaProjection(resultCode, data);
        projection.registerCallback(new MediaProjection.Callback() {
            @Override public void onStop() { stopCapture(); callJs("window.tmdAndroidScreenShareStopped&&window.tmdAndroidScreenShareStopped()"); }
        }, new Handler(Looper.getMainLooper()));
        DisplayMetrics dm = Resources.getSystem().getDisplayMetrics();
        int width = dm.widthPixels, height = dm.heightPixels;
        reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        captureThread = new HandlerThread("tmd-screen-capture"); captureThread.start();
        reader.setOnImageAvailableListener(this::onImage, new Handler(captureThread.getLooper()));
        projection.createVirtualDisplay("TMD screen", width, height, dm.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, null);
        callJs("window.tmdAndroidScreenShareStarted&&window.tmdAndroidScreenShareStarted()");
    }

    private void onImage(ImageReader source) {
        Image image = source.acquireLatestImage(); if (image == null) return;
        try {
            Image.Plane plane = image.getPlanes()[0]; ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride(), rowStride = plane.getRowStride();
            int padding = rowStride - pixelStride * image.getWidth();
            Bitmap raw = Bitmap.createBitmap(image.getWidth() + padding / pixelStride, image.getHeight(), Bitmap.Config.ARGB_8888);
            raw.copyPixelsFromBuffer(buffer);
            int targetW = Math.min(1080, image.getWidth());
            Bitmap cropped = Bitmap.createBitmap(raw, 0, 0, image.getWidth(), image.getHeight());
            Bitmap scaled = targetW == image.getWidth() ? cropped : Bitmap.createScaledBitmap(cropped, targetW, image.getHeight() * targetW / image.getWidth(), true);
            ByteArrayOutputStream out = new ByteArrayOutputStream(); scaled.compress(Bitmap.CompressFormat.JPEG, 68, out);
            latestScreenshot = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            raw.recycle(); if (cropped != raw) cropped.recycle(); if (scaled != cropped) scaled.recycle();
        } finally { image.close(); }
    }

    private void stopCapture() {
        latestScreenshot = null;
        if (projection != null) { MediaProjection old = projection; projection = null; old.stop(); }
        if (reader != null) { reader.close(); reader = null; }
        if (captureThread != null) { captureThread.quitSafely(); captureThread = null; }
    }

    private void callJs(String js) { if (web != null) web.post(() -> web.evaluateJavascript(js, null)); }
    public static void notifyShareDenied() { if (instance != null) instance.callJs("window.tmdAndroidScreenShareDenied&&window.tmdAndroidScreenShareDenied()"); }
    private int dp(int n) { return (int) (n * getResources().getDisplayMetrics().density); }

    private class Bridge {
        @JavascriptInterface public void startScreenShare() {
            Intent i = new Intent(OverlayService.this, MainActivity.class).setAction(MainActivity.ACTION_SHARE)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
        }
        @JavascriptInterface public void stopScreenShare() { new Handler(Looper.getMainLooper()).post(OverlayService.this::stopCapture); }
        @JavascriptInterface public String getLatestScreenshot() { return latestScreenshot == null ? "" : latestScreenshot; }
        @JavascriptInterface public boolean isScreenSharing() { return projection != null; }
        @JavascriptInterface public void closeAssistant() { stopSelf(); }
    }

    private class DragTouch implements View.OnTouchListener {
        float downX, downY; int startX, startY; boolean dragging;
        @Override public boolean onTouch(View v, android.view.MotionEvent e) {
            if (e.getAction() == MotionEvent.ACTION_DOWN) { downX=e.getRawX(); downY=e.getRawY(); startX=params.x; startY=params.y; dragging=false; return false; }
            if (e.getAction() == MotionEvent.ACTION_MOVE && (Math.abs(e.getRawX()-downX)>12 || Math.abs(e.getRawY()-downY)>12)) {
                dragging=true; params.x=startX-(int)(e.getRawX()-downX); params.y=startY+(int)(e.getRawY()-downY); windowManager.updateViewLayout(overlay, params); return true;
            }
            return dragging;
        }
    }

    @Override public void onDestroy() {
        stopCapture(); if (overlay != null) { windowManager.removeView(overlay); overlay=null; }
        if (web != null) { web.destroy(); web=null; } instance=null; super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
