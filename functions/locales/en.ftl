# ── /start command ─────────────────────────────────────────────────────────────

welcome = Hi! Use the activation link from the QR code to link your device.
activation-invalid = ❌ Activation code is invalid or expired.
activation-already-used = ⚠️ This activation code has already been used.
activation-success = ✅ Device linked! You will now receive authentication requests in this chat.

# ── Callback queries (Approve / Deny) ────────────────────────────────────────

cb-invalid-action = Invalid action
cb-request-not-found = Request not found
cb-no-access = No access to this request
cb-already-processed = Request already processed
cb-expired = ⏳ Request has expired
cb-approved = ✅ Login approved
cb-denied = ❌ Login denied
cb-error = An error occurred

# ── Push message ──────────────────────────────────────────────────────────────

push-title = 🔐 Login request
push-user = User: { $username }
push-app = Application: { $type }
push-domain = Domain: { $domain }
push-ip = IP: { $ipaddr }
push-time = Time: { $time }

# ── Push result (edited message) ──────────────────────────────────────────────

push-result-approved = ✅ Login approved ({ $time })
push-result-denied = ❌ Login denied ({ $time })
push-result-timeout = ⏳ Login request expired ({ $time })

# ── Inline keyboard buttons ──────────────────────────────────────────────────

btn-approve = ✅ Approve
btn-deny = ❌ Deny
