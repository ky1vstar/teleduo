// Locale strings embedded as template literals to avoid filesystem issues
// in Edge Functions.

export const EN_LOCALE = `
# ── /start command ─────────────────────────────────────────────────────────────

welcome = Hi! Use the activation link from the QR code to link your device.
activation-invalid = ❌ Activation code is invalid or expired.
activation-already-used = ⚠️ This activation code has already been used.
activation-success = ✅ Device linked! You will now receive authentication requests in this chat.
device-unlinked = ⚠️ This device has been unlinked. A new device has been linked to your account.

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
`;

export const RU_LOCALE = `
# ── /start command ─────────────────────────────────────────────────────────────

welcome = Привет! Используйте ссылку активации из QR-кода для привязки устройства.
activation-invalid = ❌ Код активации недействителен или истёк.
activation-already-used = ⚠️ Этот код активации уже был использован.
activation-success = ✅ Устройство привязано! Теперь вы будете получать запросы авторизации в этот чат.
device-unlinked = ⚠️ Это устройство было отвязано. К вашему аккаунту привязано новое устройство.

# ── Callback queries (Approve / Deny) ────────────────────────────────────────

cb-invalid-action = Недопустимое действие
cb-request-not-found = Запрос не найден
cb-no-access = Нет доступа к этому запросу
cb-already-processed = Запрос уже обработан
cb-expired = ⏳ Запрос истёк
cb-approved = ✅ Вход разрешён
cb-denied = ❌ Вход отклонён
cb-error = Произошла ошибка

# ── Push message ──────────────────────────────────────────────────────────────

push-title = 🔐 Запрос входа
push-user = Пользователь: { $username }
push-app = Приложение: { $type }
push-domain = Домен: { $domain }
push-ip = IP: { $ipaddr }
push-time = Время: { $time }

# ── Push result (edited message) ──────────────────────────────────────────────

push-result-approved = ✅ Вход разрешён ({ $time })
push-result-denied = ❌ Вход отклонён ({ $time })
push-result-timeout = ⏳ Запрос на вход истёк ({ $time })

# ── Inline keyboard buttons ──────────────────────────────────────────────────

btn-approve = ✅ Подтвердить
btn-deny = ❌ Отклонить
`;

export const UK_LOCALE = `
# ── /start command ─────────────────────────────────────────────────────────────

welcome = Привіт! Використовуйте посилання активації з QR-коду для прив'язки пристрою.
activation-invalid = ❌ Код активації недійсний або закінчився.
activation-already-used = ⚠️ Цей код активації вже було використано.
activation-success = ✅ Пристрій прив'язано! Тепер ви будете отримувати запити авторизації у цей чат.
device-unlinked = ⚠️ Цей пристрій було відв'язано. До вашого акаунту прив'язано новий пристрій.

# ── Callback queries (Approve / Deny) ────────────────────────────────────────

cb-invalid-action = Недопустима дія
cb-request-not-found = Запит не знайдено
cb-no-access = Немає доступу до цього запиту
cb-already-processed = Запит вже оброблено
cb-expired = ⏳ Запит закінчився
cb-approved = ✅ Вхід дозволено
cb-denied = ❌ Вхід відхилено
cb-error = Сталася помилка

# ── Push message ──────────────────────────────────────────────────────────────

push-title = 🔐 Запит на вхід
push-user = Користувач: { $username }
push-app = Застосунок: { $type }
push-domain = Домен: { $domain }
push-ip = IP: { $ipaddr }
push-time = Час: { $time }

# ── Push result (edited message) ──────────────────────────────────────────────

push-result-approved = ✅ Вхід дозволено ({ $time })
push-result-denied = ❌ Вхід відхилено ({ $time })
push-result-timeout = ⏳ Запит на вхід закінчився ({ $time })

# ── Inline keyboard buttons ──────────────────────────────────────────────────

btn-approve = ✅ Підтвердити
btn-deny = ❌ Відхилити
`;
