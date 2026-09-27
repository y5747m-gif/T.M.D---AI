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
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    public static final String ACTION_SHARE = "ai.tmd.assistant.SHARE_SCREEN";
    private static final int OVERLAY_REQUEST = 100;
    private static final int CAPTURE_REQUEST = 101;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        showHome();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 102);
        routeIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        routeIntent(intent);
    }

    private void routeIntent(Intent intent) {
        if (ACTION_SHARE.equals(intent.getAction())) {
            requestCapture();
        }
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(value); view.setTextSize(sp); view.setTextColor(color);
        view.setGravity(Gravity.CENTER); view.setPadding(24, 20, 24, 20);
        return view;
    }

    private void showHome() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER);
        root.setPadding(42, 60, 42, 60); root.setBackgroundColor(Color.rgb(5, 9, 18));
        root.addView(text("✦", 64, Color.rgb(155, 114, 203)));
        root.addView(text("T.M.D AI", 30, Color.WHITE));
        root.addView(text("المساعد العائم على هاتفك\nدردشة ومشاركة شاشة فوق كل التطبيقات", 18, Color.LTGRAY));
        Button launch = new Button(this); launch.setText("تشغيل الفقاعة العائمة");
        launch.setOnClickListener(v -> launchOverlay()); root.addView(launch, fullWidth());
        Button share = new Button(this); share.setText("تشغيل الفقاعة ومشاركة الشاشة");
        share.setOnClickListener(v -> { launchOverlay(); requestCapture(); }); root.addView(share, fullWidth());
        Button stop = new Button(this); stop.setText("إيقاف المساعد");
        stop.setOnClickListener(v -> stopService(new Intent(this, OverlayService.class))); root.addView(stop, fullWidth());
        root.addView(text("ستظهر موافقة Android عند أول تشغيل وعند بدء مشاركة الشاشة. لا يمكن للتطبيق تجاوز هذه الموافقات لحماية خصوصيتك.", 14, Color.GRAY));
        setContentView(root);
    }

    private LinearLayout.LayoutParams fullWidth() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.setMargins(0, 12, 0, 12); return p;
    }

    private boolean hasOverlayPermission() { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this); }

    private void launchOverlay() {
        if (!hasOverlayPermission()) {
            startActivityForResult(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())), OVERLAY_REQUEST);
            return;
        }
        Intent service = new Intent(this, OverlayService.class).setAction(OverlayService.ACTION_SHOW);
        startForegroundService(service);
        moveTaskToBack(true);
    }

    private void requestCapture() {
        if (!hasOverlayPermission()) { launchOverlay(); return; }
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(manager.createScreenCaptureIntent(), CAPTURE_REQUEST);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OVERLAY_REQUEST && hasOverlayPermission()) launchOverlay();
        if (request == CAPTURE_REQUEST) {
            if (result == RESULT_OK && data != null) {
                Intent service = new Intent(this, OverlayService.class).setAction(OverlayService.ACTION_CAPTURE);
                service.putExtra(OverlayService.EXTRA_RESULT_CODE, result);
                service.putExtra(OverlayService.EXTRA_RESULT_DATA, data);
                startForegroundService(service);
                moveTaskToBack(true);
            } else OverlayService.notifyShareDenied();
        }
    }
}
