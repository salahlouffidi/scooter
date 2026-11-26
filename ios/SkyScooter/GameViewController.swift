import UIKit
import WebKit

/// Hosts the shared Three.js game (app/src/main/assets/game) in a WKWebView and
/// exposes the same `window.AndroidBridge` API the Android build provides, so the
/// game code runs unchanged on both platforms.
final class GameViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {

    private var webView: WKWebView!
    private let ads = AdManager()
    private let defaults = UserDefaults.standard
    private let snapshotKey = "louffi_active_run.snapshot"
    private let privacyURL = URL(string: "https://salahlouffidi.github.io/sky-scooter-privacy.html")!

    // MARK: Screen

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()

        let controller = WKUserContentController()
        controller.add(WeakHandler(self), name: "bridge")
        controller.addUserScript(WKUserScript(source: bridgeScript(),
                                              injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
        config.userContentController = controller

        webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        webView.navigationDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadGame()

        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(appBackground),
                       name: UIApplication.willResignActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(appForeground),
                       name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    private var adsStarted = false
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        guard !adsStarted else { return }
        adsStarted = true
        ads.start(from: self) { [weak self] in self?.pushNativeState() }
    }

    private func loadGame() {
        guard let dir = Bundle.main.url(forResource: "game", withExtension: nil) else { return }
        webView.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
    }

    @objc private func appBackground() { js("window.gameInstance?.onAppBackground?.();") }
    @objc private func appForeground() { js("window.gameInstance?.onAppForeground?.();") }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loadGame() }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pushNativeState()
        #if DEBUG
        // Store-screenshot scenes, launched from CI with `-ssScene rounds` or `-ssScene round:6`.
        if let scene = UserDefaults.standard.string(forKey: "ssScene") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
                if scene == "rounds" {
                    self?.js("document.getElementById('btn-menu-rounds')?.click();")
                } else if scene.hasPrefix("round:"), let n = Int(scene.dropFirst(6)) {
                    self?.js("window.gameInstance?.startRound?.(\(n), false, true);")
                }
            }
        }
        // Boot probe used by the CI simulator check.
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            self?.webView.evaluateJavaScript(
                "JSON.stringify({kit:window.louffiAssetStatus||null,state:(window.gameInstance&&window.gameInstance.state)||null,canvas:document.querySelectorAll('canvas').length,ios:!!window.__IOS__})"
            ) { result, error in
                NSLog("[SkyScooterProbe] %@", String(describing: result ?? error ?? "nil"))
            }
        }
        #endif
    }

    // MARK: Bridge

    private func js(_ code: String) {
        webView?.evaluateJavaScript(code, completionHandler: nil)
    }

    /// Values the game reads synchronously are mirrored into JS.
    private func pushNativeState() {
        js("window.__iosRewardedReady=\(ads.isRewardedReady);window.__iosPrivacyRequired=\(ads.privacyOptionsRequired);")
    }

    private func jsStringLiteral(_ s: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [s]),
              let arr = String(data: data, encoding: .utf8) else { return "''" }
        return "(\(arr))[0]"
    }

    private func bridgeScript() -> String {
        let snapshot = defaults.string(forKey: snapshotKey) ?? ""
        var kit = ""
        if let dir = Bundle.main.url(forResource: "game", withExtension: nil),
           let data = try? Data(contentsOf: dir.appendingPathComponent("models/louffi-world.glb")) {
            kit = data.base64EncodedString()
        }
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        return """
        (function(){
          var post=function(m,a){try{window.webkit.messageHandlers.bridge.postMessage({m:m,a:(a===undefined?null:a)});}catch(e){}};
          var snap=\(jsStringLiteral(snapshot));
          var kit=\(jsStringLiteral(kit));
          window.__IOS__=true;
          window.addEventListener('error',function(e){post('log','error: '+e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno);});
          ['warn','error'].forEach(function(k){var o=console[k];console[k]=function(){try{post('log',k+': '+Array.prototype.map.call(arguments,String).join(' '));}catch(e){}return o.apply(console,arguments);};});
          window.AndroidBridge={
            isRewardedAdReady:function(){return !!window.__iosRewardedReady;},
            showInterstitial:function(){post('showInterstitial');},
            showRewardedRevive:function(){post('showRewardedRevive');},
            readRunSnapshot:function(){return snap||'';},
            writeRunSnapshot:function(s){
              if(typeof s!=='string'||s.length>2000000)return false;
              try{if(JSON.parse(s).version!==1)return false;}catch(e){return false;}
              snap=s;post('writeRunSnapshot',s);return true;},
            clearRunSnapshot:function(){snap='';post('clearRunSnapshot');},
            readVisualKit:function(){if(!kit)throw Error('kit missing');return kit;},
            vibrate:function(ms){post('vibrate',[Number(ms)||0]);},
            vibratePattern:function(json,k){post('vibratePattern',[String(json),Number(k)||1]);},
            onGameStateChanged:function(s){post('state',String(s));},
            openPrivacyPolicy:function(){post('openPrivacyPolicy');},
            isPrivacyOptionsRequired:function(){return !!window.__iosPrivacyRequired;},
            showPrivacyOptions:function(){post('showPrivacyOptions');},
            getAppVersion:function(){return '\(version)-louffi-ios';}
          };
        })();
        """
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let m = body["m"] as? String else { return }
        let arg = body["a"]
        switch m {
        case "showInterstitial":
            ads.showInterstitial(from: self) { [weak self] in
                self?.js("window.gameInstance?.onInterstitialClosed?.();")
                self?.pushNativeState()
            }
        case "showRewardedRevive":
            ads.showRewarded(from: self, unavailable: { [weak self] in
                self?.js("window.gameInstance?.onRewardedAdUnavailable?.();")
                self?.pushNativeState()
            }, result: { [weak self] earned in
                self?.js(earned ? "window.gameInstance?.onRewardedReviveEarned?.();"
                                : "window.gameInstance?.onRewardedAdNotCompleted?.();")
                self?.pushNativeState()
            })
        case "writeRunSnapshot":
            if let s = arg as? String { defaults.set(s, forKey: snapshotKey) }
        case "clearRunSnapshot":
            defaults.removeObject(forKey: snapshotKey)
        case "vibrate":
            let ms = ((arg as? [Any])?.first as? NSNumber)?.doubleValue ?? 20
            Haptics.pulse(ms: ms, strength: 1)
        case "vibratePattern":
            guard let a = arg as? [Any], let json = a.first as? String,
                  let data = json.data(using: .utf8),
                  let timings = try? JSONSerialization.jsonObject(with: data) as? [NSNumber] else { return }
            let k = (a.count > 1 ? (a[1] as? NSNumber)?.doubleValue : nil) ?? 1
            Haptics.pattern(timings.map { $0.doubleValue }, strength: k)
        case "state":
            let s = arg as? String ?? ""
            UIApplication.shared.isIdleTimerDisabled = (s == "PLAYING" || s == "COUNTDOWN")
        case "openPrivacyPolicy":
            UIApplication.shared.open(privacyURL)
        case "showPrivacyOptions":
            ads.showPrivacyOptions(from: self) { [weak self] in self?.pushNativeState() }
        case "log":
            NSLog("[SkyScooterJS] %@", String(describing: arg ?? ""))
        default:
            break
        }
    }
}

/// Avoids the retain cycle WKUserContentController creates with its handlers.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        target?.userContentController(c, didReceive: m)
    }
}

/// Maps Android vibration lengths/patterns onto the Taptic Engine.
enum Haptics {
    static func pulse(ms: Double, strength: Double) {
        let ms = min(max(ms, 5), 500)
        let style: UIImpactFeedbackGenerator.FeedbackStyle = ms < 15 ? .light : (ms < 40 ? .medium : .heavy)
        let gen = UIImpactFeedbackGenerator(style: style)
        let intensity = CGFloat(min(max(0.35 + ms / 80 * strength, 0.3), 1))
        gen.impactOccurred(intensity: intensity)
    }

    /// Android pattern: [wait, buzz, wait, buzz, ...] in milliseconds.
    static func pattern(_ timings: [Double], strength: Double) {
        let t = Array(timings.prefix(16)).map { min(max($0, 0), 400) }
        guard t.reduce(0, +) <= 1200 else { return }
        var at = 0.0
        for (i, d) in t.enumerated() {
            if i % 2 == 1 && d > 0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + at / 1000) {
                    pulse(ms: d, strength: strength)
                }
            }
            at += d
        }
    }
}
