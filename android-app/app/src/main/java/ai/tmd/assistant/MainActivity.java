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
import android.speech.RecognizerIntent;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;

/**
 * شاشة إدارة صغيرة للفقاعة. كل صلاحية حساسة يطلبها Android في وقت الاستخدام
 * فقط؛ لا يحاول التطبيق تجاوز موافقة المستخدم أو قراءة محتوى لم يختره بنفسه.
 */
public class MainActivity extends Activity {
    public static final String ACTION_SHARE = "ai.tmd.assistant.SHARE_SCREEN";
    public static final String ACTION_PICK_IMAGE = "ai.tmd.assistant.PICK_IMAGE";
    public static final String ACTION_VOICE = "ai.tmd.assistant.VOICE_INPUT";

    private static final int OVERLAY_REQUEST = 100;
    private static final int CAPTURE_REQUEST = 101;
    private static final int NOTIFICATIONS_REQUEST = 102;
    private static final int IMAGE_REQUEST = 103;
    private static final int VOICE_REQUEST = 104;
    private static final int MICROPHONE_REQUEST = 105;

    private String pendingAction;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        showHome();
        handleIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        pendingAction = intent == null ? null : intent.getAction();
        if (needsNotificationPermission()) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS_REQUEST);
            return;
        }
        continuePendingAction();
    }

    private void continuePendingAction() {
        String action = pendingAction;
        if (ACTION_SHARE.equals(action)) {
            requestCapture();
        } else if (ACTION_PICK_IMAGE.equals(action)) {
            requestImage();
        } else if (ACTION_VOICE.equals(action)) {
            requestVoice();
        } else {
            launchOverlay();
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NOTIFICATIONS_REQUEST) {
            // رفض الإشعارات لا يمنع الأداة، لكن Android قد يخفي إشعار خدمتها.
            continuePendingAction();
        } else if (requestCode == MICROPHONE_REQUEST) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                launchVoiceRecognizer();
            } else {
                OverlayService.notifyVoiceError("تم رفض إذن الميكروفون. فعّله من إعدادات التطبيق لاستخدام التحدث.");
                moveTaskToBack(true);
            }
        }
    }

    private boolean needsNotificationPermission() {
        return Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
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
        root.addView(text("فقاعة دردشة مصغرة فوق تطبيقات هاتفك\nمع الصور والصوت ومشاركة الشاشة", 18, Color.LTGRAY));

        Button launch = new Button(this);
        launch.setText("تشغيل الفقاعة العائمة");
        launch.setOnClickListener(v -> { pendingAction = null; launchOverlay(); });
        root.addView(launch, fullWidth());

        Button share = new Button(this);
        share.setText("مشاركة الشاشة مع المساعد");
        share.setOnClickListener(v -> { pendingAction = ACTION_SHARE; requestCapture(); });
        root.addView(share, fullWidth());

        Button stop = new Button(this);
        stop.setText("إيقاف المساعد");
        stop.setOnClickListener(v -> stopService(new Intent(this, OverlayService.class)));
        root.addView(stop, fullWidth());

        root.addView(text(
                "يطلب التطبيق صلاحية الظهور فوق التطبيقات. الميكروفون والصورة ومشاركة الشاشة لا تُستخدم إلا بعد ضغطك على الأداة وموافقتك الصريحة.",
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
        startAssistantService(OverlayService.ACTION_SHOW, RESULT_CANCELED, null);
        moveTaskToBack(true);
    }

    private boolean ensureOverlayPermission() {
        if (hasOverlayPermission()) return true;
        startActivityForResult(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getPackageName())), OVERLAY_REQUEST);
        return false;
    }

    private void requestCapture() {
        if (!ensureOverlayPermission()) return;
        startAssistantService(OverlayService.ACTION_SHOW, RESULT_CANCELED, null);
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(manager.createScreenCaptureIntent(), CAPTURE_REQUEST);
    }

    private void requestImage() {
        if (!ensureOverlayPermission()) return;
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("image/*");
        startActivityForResult(picker, IMAGE_REQUEST);
    }

    private void requestVoice() {
        if (!ensureOverlayPermission()) return;
        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE_REQUEST);
            return;
        }
        launchVoiceRecognizer();
    }

    private void launchVoiceRecognizer() {
        Intent voice = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-SA")
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "تحدث إلى SPARTA AI");
        try {
            startActivityForResult(voice, VOICE_REQUEST);
        } catch (Exception error) {
            OverlayService.notifyVoiceError("لا توجد خدمة تعرّف صوتي متاحة على هذا الهاتف.");
            moveTaskToBack(true);
        }
    }

    private void startAssistantService(String action, int resultCode, Intent source) {
        Intent service = new Intent(this, OverlayService.class).setAction(action);
        if (source != null) {
            service.putExtra(OverlayService.EXTRA_RESULT_CODE, resultCode);
            service.putExtra(OverlayService.EXTRA_RESULT_DATA, source);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service);
        else startService(service);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OVERLAY_REQUEST) {
            if (hasOverlayPermission()) continuePendingAction();
            else OverlayService.notifyPermissionError("يلزم السماح بالظهور فوق التطبيقات لتشغيل الفقاعة.");
            return;
        }
        if (request == CAPTURE_REQUEST) {
            if (result == RESULT_OK && data != null) {
                startAssistantService(OverlayService.ACTION_CAPTURE, result, data);
            } else {
                OverlayService.notifyShareDenied();
            }
            moveTaskToBack(true);
            return;
        }
        if (request == IMAGE_REQUEST) {
            if (result == RESULT_OK && data != null && data.getData() != null) {
                OverlayService.deliverPickedImage(data.getData());
            } else {
                OverlayService.notifyImageError("لم يتم اختيار صورة.");
            }
            moveTaskToBack(true);
            return;
        }
        if (request == VOICE_REQUEST) {
            if (result == RESULT_OK && data != null) {
                ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (matches != null && !matches.isEmpty()) OverlayService.deliverVoiceText(matches.get(0));
                else OverlayService.notifyVoiceError("لم أتمكن من سماع كلام واضح.");
            } else {
                OverlayService.notifyVoiceError("أُلغي الإدخال الصوتي.");
            }
            moveTaskToBack(true);
        }
    }
}
