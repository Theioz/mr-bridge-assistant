// Run on any amazon.com page (the Fresh cart is best). READ-ONLY.
// Returns the state every later step depends on; see SKILL.md "Preflight".
(() => {
  const text = document.body.innerText;
  const acct = document.querySelector("#nav-link-accountList-nav-line-1")?.innerText?.trim() ?? "";
  return {
    url: location.pathname,
    signedIn: acct !== "" && !/sign in/i.test(acct),
    greeting: acct,
    deliverTo: document.querySelector("#glow-ingress-line2")?.innerText?.trim() ?? null,
    captcha:
      !!document.querySelector('form[action*="validateCaptcha"]') ||
      /enter the characters you see/i.test(text),
    freshUnavailable: /amazon fresh is not available for this location/i.test(text),
    signInWall: !!document.querySelector("#ap_email, #ap_password, form[name='signIn']"),
  };
})();
