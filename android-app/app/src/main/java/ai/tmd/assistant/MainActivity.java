package ai.tmd.assistant;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * نقطة الدخول الوحيدة للتطبيق. لا يتجاوز التطبيق أي موافقة من Android:
 * الإشعارات والظهور فوق التطبيقات ومشاركة الشاشة جميعها قرارات صريحة للمستخدم.
 */
public class MainActivity extends Activity {
    public static final String ACTION_SHARE = "ai.tmd.assistant.SHARE_SCREEN";
    private static final int OVERLAY_REQUEST = 100;
    private static final int CAPTURE_REQUEST = 101;
    private static final int NOTIFICATIONS_REQUEST = 102;
    private boolean captureAfterOverlayPermission;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        showHome();

        // أول فتح للتطبيق يشغّل الفقاعة تلقائياً بعد موافقات النظام اللازمة.
        // لا نعرض نافذتي موافقة في وقت واحد، لذلك نكمل التسلسل في callback.
        if (needsNotificationPermission()) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS_REQUEST);
        } else if (!ACTION_SHARE.equals(getIntent().getAction())) {
            launchOverlay();
        }
        routeIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        routeIntent(intent);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NOTIFICATIONS_REQUEST && !ACTION_SHARE.equals(getIntent().getAction())) {
            // رفض الإشعار لا يمنع الفقاعة؛ يبقى للمستخدم قرار تشغيلها.
            launchOverlay();
        }
    }

    private boolean needsNotificationPermission() {
        return Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
    }

    private void routeIntent(Intent intent) {
        if (intent != null && ACTION_SHARE.equals(intent.getAction())) requestCapture();
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setGravity(Gravity.CENTER);
        view.setPadding(24, 20, 24, 20);
        return view;
    }

    private void showHome() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(42, 60, 42, 60);
        root.setBackgroundColor(Color.rgb(5, 9, 18));

        root.addView(text("ϟ", 64, Color.WHITE));
        root.addView(text("SPARTA AI", 30, Color.WHITE));
        root.addView(text("المساعد العائم على هاتفك\nدردشة ومشاركة شاشة فوق كل التطبيقات", 18, Color.LTGRAY));

        Button launch = new Button(this);
        launch.setText("تشغيل الفقاعة العائمة");
        launch.setOnClickListener(v -> launchOverlay());
        root.addView(launch, fullWidth());

        Button share = new Button(this);
        share.setText("مشاركة الشاشة مع المساعد");
        share.setOnClickListener(v -> requestCapture());
        root.addView(share, fullWidth());

        Button stop = new Button(this);
        stop.setText("إيقاف المساعد");
        stop.setOnClickListener(v -> stopService(new Intent(this, OverlayService.class)));
        root.addView(stop, fullWidth());

        root.addView(text(
                "ستطلب Android إذن الإشعارات والظهور فوق التطبيقات عند أول تشغيل. " +
                "مشاركة الشاشة لا تبدأ إلا عند ضغطك على زرها وموافقتك في نافذة Android.",
                14, Color.GRAY));
        setContentView(root);
    }

    private LinearLayout.LayoutParams fullWidth() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.setMargins(0, 12, 0, 12);
        return p;
    }

    private boolean hasOverlayPermission() {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this);
    }

    private void launchOverlay() {
        if (!hasOverlayPermission()) {
            startActivityForResult(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())), OVERLAY_REQUEST);
            return;
        }
        startAssistantService(OverlayService.ACTION_SHOW, null);
        moveTaskToBack(true);
    }

    private void requestCapture() {
        if (!hasOverlayPermission()) {
            captureAfterOverlayPermission = true;
            launchOverlay();
            return;
        }
        // اجعل الخدمة موجودة قبل الانتقال إلى موافقة MediaProjection.
        startAssistantService(OverlayService.ACTION_SHOW, null);
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(manager.createScreenCaptureIntent(), CAPTURE_REQUEST);
    }

    private void startAssistantService(String action, Intent source) {
        Intent service = new Intent(this, OverlayService.class).setAction(action);
        if (source != null) {
            service.putExtra(OverlayService.EXTRA_RESULT_CODE, RESULT_OK);
            service.putExtra(OverlayService.EXTRA_RESULT_DATA, source);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service);
        else startService(service);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OVERLAY_REQUEST) {
            if (hasOverlayPermission()) {
                boolean startCapture = captureAfterOverlayPermission;
                captureAfterOverlayPermission = false;
                // لا نضع النشاط في الخلفية قبل نافذة MediaProjection؛ Android
                // يعرض موافقة المشاركة فوق النشاط الذي طلبها.
                if (startCapture) requestCapture();
                else launchOverlay();
            }
            return;
        }
        if (request == CAPTURE_REQUEST) {
            if (result == RESULT_OK && data != null) {
                startAssistantService(OverlayService.ACTION_CAPTURE, data);
                moveTaskToBack(true);
            } else {
                OverlayService.notifyShareDenied();
            }
        }
    }
}
