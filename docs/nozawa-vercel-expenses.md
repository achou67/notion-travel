# 野澤滑雪分帳

正式站為 https://nozawa-itinerary.vercel.app，分帳入口為 `/expenses`。

## 正式環境設定

在 Vercel 的 Production 設定以下變數。Google Client Secret、Auth Secret、Notion token 與旅伴信箱請使用 Secret。

| 變數 | 值 |
| --- | --- |
| `EXPENSE_AUTH_URL` | `https://nozawa-itinerary.vercel.app` |
| `EXPENSE_AUTH_SECRET` | 隨機產生的長字串，用來保護登入工作階段 |
| `EXPENSE_GOOGLE_CLIENT_ID` | Google Auth Platform 的 Web application Client ID |
| `EXPENSE_GOOGLE_CLIENT_SECRET` | 該 OAuth Client 的 Client Secret |
| `EXPENSE_ADMIN_EMAILS` | 管理員 Google 信箱，以逗號分隔 |
| `EXPENSE_MEMBER_EMAILS` | 可登入的旅伴 Google 信箱，以逗號分隔，可先留空 |
| `EXPENSE_NOTION_TOKEN` | 具有讀取、新增和更新權限的分帳專用 Notion 連線 |
| `EXPENSE_NOTION_EXPENSES_ID` | `422e59a5-4a3a-811e-8981-000bdd908613` |
| `EXPENSE_NOTION_MEMBERS_ID` | `422e59a5-4a3a-81af-aa47-000b7ae768de` |

Google OAuth 的 Authorized redirect URI 為 `https://nozawa-itinerary.vercel.app/api/auth/callback/google`。若 Google 專案的發布模式限制測試使用者，將受邀帳號加入 Google 的測試使用者名單。網站也會核對自己的旅伴名單。

在 Notion 將分帳專用連線授權給「2027 野澤滑雪｜共同支出分帳」及底下的「共同支出」和「旅伴與結算」資料庫，保留 `網站建立者 ID` 欄位。在「旅伴與結算」替每位需要分攤的人新增一列姓名，有沒有登入信箱都可以列入分攤。

設定完成後用正式環境重新部署。先用管理員測試新增與編輯，再用受邀旅伴測試新增、編輯本人紀錄和結算。從未登入的視窗開啟同一網址，確認只有分帳頁要求登入。

分帳的兩種幣別各自結算。每筆日圓以 1 日圓、台幣以 0.01 元為最小單位平分，剩餘單位依參與者 ID 的固定順序分配。分帳不寫進離線的行程備份。

`node --test netlify/tests/*.test.js netlify/tests/*.test.mjs frontend/src/*.test.js` 可驗證權限、資料驗證及結算。
