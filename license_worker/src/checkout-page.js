/**
 * ThreadsBlocker Pro checkout page.
 * ADR: docs/adr/0015-payuni-dynamic-checkout-relay.md
 * ADR: docs/adr/0016-payuni-production-pages-and-manual-invoicing.md
 */

export function renderCheckoutPage({ mode = "standard", sandbox = false, paymentLinks = null } = {}) {
  const isEarly = mode === "early";
  const hostedCheckout = isEarly
    ? Boolean(paymentLinks && paymentLinks.early_year)
    : Boolean(paymentLinks && paymentLinks.month && paymentLinks.year);
  const badge = isEarly
    ? '<span class="launch-badge">3.0 早鳥・首年限定</span>'
    : '<span class="launch-badge quiet">正式方案</span>';
  const plans = isEarly
    ? '<label class="plan"><input type="radio" name="plan" value="early_year" checked><span class="plan-name">早鳥年付</span><div class="price">NT$690<small> / 首年</small></div><div class="save">一次付清・到期續購回原價 990</div></label>'
    : '<label class="plan"><input type="radio" name="plan" value="month" checked><span class="plan-name">月付</span><div class="price">NT$129<small> / 月</small></div><div class="save">每月 5 日扣款，共 12 期</div></label><label class="plan"><input type="radio" name="plan" value="year"><span class="plan-name">年付</span><div class="price">NT$990<small> / 年</small></div><div class="save">一次付清，不分期、不自動續年</div></label>';
  const sandboxBanner = sandbox ? '<div class="sandbox-banner" role="status">SANDBOX 測試環境・不會產生真實扣款或正式資格</div>' : '';
  const emailField = hostedCheckout ? '' : '<label class="field">輸入你的 Email<input id="email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required maxlength="254"></label>';
  const agreement = isEarly
    ? "我了解付款後會以 PAYUNi 填寫的 Email 開通 Pro；早鳥價只適用首年，本次為一次付清、不分期，也不會自動續扣。"
    : hostedCheckout
      ? "我了解付款後會以 PAYUNi 填寫的 Email 開通 Pro；月付固定每月 5 日扣款、共 12 期，年付一次付清且不自動續訂。"
      : "我了解付款後會以此 Email 開通 Pro；月付每月自動續訂，可隨時取消；年付一次付清，不會自動續訂。";
  const checkoutScript = hostedCheckout
    ? `const hostedLinks=${JSON.stringify(paymentLinks)};form.addEventListener('submit',(event)=>{event.preventDefault();error.textContent='';const plan=new FormData(form).get('plan');const target=hostedLinks[plan];if(!target){error.textContent='目前無法建立付款頁，請稍後再試。';return}button.disabled=true;button.textContent='正在前往 PAYUNi…';window.location.assign(target)});`
    : `form.addEventListener('submit',async(event)=>{event.preventDefault();error.textContent='';button.disabled=true;button.textContent='正在建立安全付款頁…';
      try{const response=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,plan:new FormData(form).get('plan')})});
        const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'CHECKOUT_FAILED');
        const payment=document.createElement('form');payment.method='POST';payment.action=result.endpoint;
        for(const [name,value] of Object.entries(result.fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;payment.appendChild(input)}
        document.body.appendChild(payment);payment.submit();
      }catch(_){error.textContent='目前無法建立付款頁，請稍後再試。';button.disabled=false;button.textContent='${sandbox ? "前往 PAYUNi Sandbox 測試付款 →" : "前往 PAYUNi 安全付款 →"}'}
    });`;

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>留友封 Pro｜把時間留給值得的人</title>
  <style>
    :root{--ink:#11130f;--paper:#f2f0e9;--acid:#b9f227;--green:#175c38;--line:#23271f;--muted:#686c62;--red:#a4382b}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif}
    body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.16;background-image:repeating-linear-gradient(0deg,transparent 0 5px,rgba(17,19,15,.06) 6px)}
    .sandbox-banner{position:fixed;z-index:20;top:0;left:0;right:0;padding:9px 16px;text-align:center;background:#ffd43b;color:#11130f;font-size:13px;font-weight:950;letter-spacing:.04em}.sandbox-banner+.shell{padding-top:37px}
    .shell{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(340px,.9fr);position:relative}
    .story{padding:clamp(32px,6vw,88px);border-right:2px solid var(--line);display:flex;flex-direction:column;justify-content:space-between;gap:56px}
    .brand{display:flex;align-items:center;gap:12px;font-weight:900;letter-spacing:.08em}.mark{width:34px;height:34px;background:var(--ink);color:var(--acid);display:grid;place-items:center;border-radius:50%;font-family:Georgia,serif;font-size:22px}
    h1{font-family:"Iowan Old Style","Noto Serif TC",Georgia,serif;font-size:clamp(52px,7.8vw,116px);line-height:.87;letter-spacing:-.065em;margin:0;max-width:850px;font-weight:900}
    h1 em{font-style:normal;color:var(--green);display:block;margin-left:.5em}.dek{max-width:640px;font-size:clamp(17px,2vw,23px);line-height:1.65;margin:28px 0 0;color:#35392f}
    .rules{display:grid;grid-template-columns:repeat(3,1fr);border:2px solid var(--line);background:rgba(255,255,255,.32)}.rule{padding:18px;border-right:1px solid var(--line)}.rule:last-child{border:0}.rule strong{display:block;font-family:Georgia,serif;font-size:30px}.rule span{font-size:13px;color:var(--muted)}
    .checkout{padding:clamp(28px,5vw,72px);display:flex;align-items:center;background:var(--ink);color:#f8f7f1}.card{width:min(100%,520px);margin:auto}.launch-badge{display:inline-block;background:var(--acid);color:var(--ink);padding:7px 11px;border-radius:999px;font-size:12px;font-weight:900;letter-spacing:.06em}.launch-badge.quiet{background:#353a31;color:#e9ece3}
    h2{font-family:"Iowan Old Style","Noto Serif TC",Georgia,serif;font-size:42px;margin:22px 0 8px}.sub{color:#aeb3a7;margin:0 0 28px;line-height:1.6}
    .plans{display:grid;grid-template-columns:${isEarly ? "1fr" : "1fr 1fr"};gap:10px}.plan{position:relative;border:1px solid #555b50;border-radius:16px;padding:20px;cursor:pointer;transition:.2s;background:#1a1d18}.plan:hover{transform:translateY(-2px);border-color:#92998a}.plan:has(input:checked){border:2px solid var(--acid);padding:19px;background:#20251b;box-shadow:0 0 0 4px rgba(185,242,39,.12)}.plan input{position:absolute;opacity:0}.plan-name{font-weight:800}.price{font-family:Georgia,serif;font-size:38px;margin-top:16px}.price small{font:12px sans-serif;color:#aeb3a7}.save{color:var(--acid);font-size:12px;font-weight:800;margin-top:5px}
    label.field{display:block;margin-top:22px;font-size:13px;font-weight:800;color:#dfe2d8}.field input{display:block;width:100%;margin-top:8px;background:#0f110e;color:#fff;border:1px solid #555b50;border-radius:11px;padding:15px 16px;font-size:16px;outline:none}.field input:focus{border-color:var(--acid);box-shadow:0 0 0 3px rgba(185,242,39,.14)}
    .agree{display:flex;gap:9px;align-items:flex-start;margin:17px 0;color:#aeb3a7;font-size:12px;line-height:1.55}.agree input{margin-top:3px;accent-color:var(--acid)}
    .pay{width:100%;border:0;border-radius:12px;padding:16px 18px;background:var(--acid);color:var(--ink);font-size:16px;font-weight:950;cursor:pointer;box-shadow:0 7px 0 #668a0d;transition:.12s}.pay:hover{transform:translateY(-2px);box-shadow:0 9px 0 #668a0d}.pay:active{transform:translateY(5px);box-shadow:0 2px 0 #668a0d}.pay:disabled{cursor:wait;filter:grayscale(.7);transform:none;box-shadow:none}
    .fine{font-size:12px;color:#858b7f;line-height:1.65;margin-top:22px}.error{min-height:20px;color:#ff9a88;font-size:13px;margin:12px 0}.safety{display:flex;gap:10px;align-items:center;margin-top:19px;color:#aeb3a7;font-size:12px}.shield{width:25px;height:29px;background:var(--green);clip-path:polygon(50% 0,100% 18%,90% 72%,50% 100%,10% 72%,0 18%)}
    @media(max-width:820px){.shell{grid-template-columns:1fr}.story{border-right:0;border-bottom:2px solid var(--line);padding:34px 24px 42px;gap:36px}.rules{grid-template-columns:1fr}.rule{border-right:0;border-bottom:1px solid var(--line)}.checkout{padding:42px 22px 54px}.plans{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important}}
  </style>
</head>
<body>
  ${sandboxBanner}
  <main class="shell">
    <section class="story">
      <div class="brand"><span class="mark">留</span> THREADSBLOCKER / PRO</div>
      <div><h1>把雜訊封掉，<em>把時間留下。</em></h1><p class="dek">一般封鎖、手動檢舉永遠免費。Pro 解鎖的是大量「三無」清理與重度管理工具——你付的是省下來的時間。</p></div>
      <div class="rules"><div class="rule"><strong>3</strong><span>最多啟用裝置</span></div><div class="rule"><strong>0</strong><span>不販售你的使用資料</span></div><div class="rule"><strong>∞</strong><span>手動封鎖與檢舉免費</span></div></div>
    </section>
    <section class="checkout">
      <form class="card" id="checkout-form">
        ${badge}
        <h2>${isEarly ? "早鳥年付" : "選擇 Pro 方案"}</h2>
        <p class="sub">付款完成後會寄出 Pro 開通信。</p>
        <div class="plans">
          ${plans}
        </div>
        ${emailField}
        <label class="agree"><input id="agree" type="checkbox" required><span>${agreement}</span></label>
        <div class="error" id="error" role="alert" aria-live="polite"></div>
        <button class="pay" id="pay" type="submit">${sandbox ? "前往 PAYUNi Sandbox 測試付款 →" : "前往 PAYUNi 安全付款 →"}</button>
        <div class="safety"><span class="shield"></span><span>卡號只在 PAYUNi 付款頁輸入，留友封不接觸或保存完整卡號。</span></div>
        <p class="fine">安全底線不進付費牆：手動封鎖與檢舉功能持續免費。若付款後未收到信，請聯絡 skiseiju@gmail.com。</p>
      </form>
    </section>
  </main>
  <script>
    const form=document.getElementById('checkout-form'),button=document.getElementById('pay'),error=document.getElementById('error');
    ${checkoutScript}
  </script>
</body>
</html>`;
}
