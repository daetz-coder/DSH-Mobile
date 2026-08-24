package io.dsh.mobile;

import android.Manifest;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * QrScannerPlugin: native QR scan powered by CameraX + ZXing.
 *
 * No Google Play Services dependency (ZXing core decodes on-device), so it
 * works fully offline / on GMS-less devices. Provides a full-screen camera
 * overlay with a cancel affordance, resolves:
 *   - { value: "<decoded payload>" } on success
 *   - { value: null } when the user cancels
 *
 * Registered as Capacitor plugin "QrScanner" (see MainActivity).
 */
@CapacitorPlugin(
        name = "QrScanner",
        permissions = {
                @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
        })
public class QrScannerPlugin extends Plugin {

    private static final long ANALYZE_INTERVAL_MS = 250L;

    private ExecutorService analysisExecutor;
    private FrameLayout overlay;
    private PreviewView previewView;
    private ProcessCameraProvider cameraProvider;
    private PluginCall pendingCall;
    private boolean analyzing = true;
    private long lastAnalyzeAt = 0L;
    private final android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());

    @PluginMethod(permission = "camera")
    public void scan(PluginCall call) {
        try {
            boolean granted = getPermissionState("camera").getState() == PermissionState.GRANTED;
            if (!granted) {
                requestPermissionForAlias("camera", call, "permissionCallback");
                return;
            }
            startScanner(call);
        } catch (Exception ex) {
            call.reject("scanner init failed: " + ex);
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = getPermissionState("camera").getState() == PermissionState.GRANTED;
        if (!granted) {
            JSObject ret = new JSObject();
            ret.put("value", JSONObject.NULL); // treat denial as cancel
            call.resolve(ret);
            return;
        }
        startScanner(call);
    }

    /* ---------- scanner lifecycle ---------- */

    private void startScanner(PluginCall call) {
        if (getActivity() == null) {
            call.reject("no activity");
            return;
        }
        pendingCall = call;
        analysisExecutor = Executors.newSingleThreadExecutor();
        buildOverlay();
        setupCamera();
    }

    private void buildOverlay() {
        overlay = new FrameLayout(getContext());
        overlay.setBackgroundColor(0xFF000000);
        overlay.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        previewView = new PreviewView(getContext());
        previewView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        overlay.addView(previewView);

        // Cancel affordance (top-right, large touch target).
        TextView cancel = new TextView(getContext());
        cancel.setText("\u2715");
        cancel.setTextSize(26f);
        cancel.setTextColor(0xFFFFFFFF);
        cancel.setBackgroundColor(0x66000000);
        cancel.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams cancelLp = new FrameLayout.LayoutParams(64, 64);
        cancelLp.gravity = Gravity.TOP | Gravity.END;
        cancelLp.setMargins(0, 80, 24, 0);
        cancel.setLayoutParams(cancelLp);
        cancel.setOnClickListener(v -> finishWith(null));
        overlay.addView(cancel);

        // Hint text
        TextView hint = new TextView(getContext());
        hint.setText("Align the QR code within the frame");
        hint.setTextColor(0xCCFFFFFF);
        hint.setTextSize(14f);
        hint.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams hintLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hintLp.gravity = Gravity.BOTTOM;
        hintLp.setMargins(24, 0, 24, 120);
        hint.setLayoutParams(hintLp);
        overlay.addView(hint);

        ViewGroup root = (ViewGroup) getActivity().findViewById(android.R.id.content);
        root.addView(overlay);
    }

    private void setupCamera() {
        mainHandler.post(() -> {
            try {
                var future = ProcessCameraProvider.getInstance(getContext());
                future.addListener(() -> {
                    try {
                        cameraProvider = future.get();
                        bindUseCases();
                    } catch (Exception ex) {
                        finishWithError("camera bind failed: " + ex);
                    }
                }, ContextCompat.getMainExecutor(getContext()));
            } catch (Exception ex) {
                finishWithError("camera setup failed: " + ex);
            }
        });
    }

    private void bindUseCases() throws Exception {
        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        ImageAnalysis analysis = new ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build();
        analysis.setAnalyzer(analysisExecutor, this::analyzeFrame);

        CameraSelector selector = hasBackCamera()
                ? CameraSelector.DEFAULT_BACK_CAMERA
                : CameraSelector.DEFAULT_FRONT_CAMERA;

        cameraProvider.unbindAll();
        cameraProvider.bindToLifecycle(getActivity(), selector, preview, analysis);
    }

    private boolean hasBackCamera() {
        try {
            ProcessCameraProvider provider = ProcessCameraProvider.getInstance(getContext()).get();
            return provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA);
        } catch (Exception ex) {
            return true; // optimistically assume back camera
        }
    }

    private void analyzeFrame(ImageProxy image) {
        if (!analyzing) {
            image.close();
            return;
        }
        long t = System.currentTimeMillis();
        if (t - lastAnalyzeAt < ANALYZE_INTERVAL_MS) {
            image.close();
            return;
        }
        lastAnalyzeAt = t;
        try {
            Result result = decode(image);
            if (result != null) {
                analyzing = false;
                final String text = result.getText();
                mainHandler.post(() -> finishWith(text));
            }
        } catch (Exception ignored) {
            // no QR in this frame — keep scanning
        } finally {
            image.close();
        }
    }

    private Result decode(ImageProxy image) {
        ImageProxy.PlaneProxy plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        byte[] nv21 = new byte[buffer.remaining()];
        buffer.get(nv21);

        int width = image.getWidth();
        int height = image.getHeight();
        int rowStride = plane.getRowStride();
        int pixelStride = plane.getPixelStride();

        if (pixelStride != 1) {
            // Chroma subsampled; build a packed luminance row manually.
            nv21 = packLuminance(nv21, width, height, rowStride, pixelStride);
            rowStride = width;
        }

        PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(
                nv21, width, height, 0, 0, width, height, false);
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));
        MultiFormatReader reader = new MultiFormatReader();
        return reader.decodeWithState(bitmap);
    }

    private byte[] packLuminance(byte[] src, int width, int height, int rowStride, int pixelStride) {
        byte[] out = new byte[width * height];
        for (int y = 0; y < height; y++) {
            int srcRow = y * rowStride;
            int dstRow = y * width;
            for (int x = 0; x < width; x++) {
                out[dstRow + x] = src[srcRow + x * pixelStride];
            }
        }
        return out;
    }

    /* ---------- finish ---------- */

    private void finishWith(String value) {
        PluginCall call = pendingCall;
        teardown();
        if (call == null) return;
        JSObject ret = new JSObject();
        ret.put("value", value != null ? value : JSONObject.NULL);
        call.resolve(ret);
    }

    private void finishWithError(String message) {
        PluginCall call = pendingCall;
        teardown();
        if (call != null) call.reject(message);
    }

    private void teardown() {
        analyzing = false;
        mainHandler.post(() -> {
            try {
                if (cameraProvider != null) cameraProvider.unbindAll();
            } catch (Exception ignored) {
            }
            if (overlay != null && overlay.getParent() != null) {
                ((ViewGroup) overlay.getParent()).removeView(overlay);
            }
            overlay = null;
            previewView = null;
            cameraProvider = null;
        });
        if (analysisExecutor != null) {
            analysisExecutor.shutdown();
            analysisExecutor = null;
        }
        pendingCall = null;
    }

    @Override
    protected void handleOnDestroy() {
        teardown();
        super.handleOnDestroy();
    }
}