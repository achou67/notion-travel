# 野澤滑雪分帳部署設定

在 Netlify 專案啟用 Identity，將註冊方式設為 Invite only。用管理介面邀請旅伴，並在使用者的角色加入 `expense-member`。管理者用 `expense-admin`。角色變更後需重新登入或等權杖更新。邀請及重設連結可從首頁或 `/expenses` 進入。

為分帳建立專用 Notion 整合，給予 Read content、Insert content、Update content，只連線到「共同支出」和「旅伴與結算」。原本的行程整合可繼續保持唯讀。請在 Netlify 的 Functions 環境變數設定以下值：

- `EXPENSE_NOTION_TOKEN`：專用 Notion 整合的密鑰。
- `EXPENSE_NOTION_EXPENSES_ID`：共同支出 Data Source ID `422e59a5-4a3a-811e-8981-000bdd908613`。
- `EXPENSE_NOTION_MEMBERS_ID`：旅伴與結算 Data Source ID `422e59a5-4a3a-81af-aa47-000b7ae768de`。

先在 Notion 加入旅伴名單。網站新增支出時會把登入者的 Identity ID 寫入「網站建立者 ID」。既有 Notion 手動支出只有網站管理者能透過網站修改。Notion 資料庫的直接編輯權限留給管理者，旅伴從網站記帳。此頁需要網路。

本機可在專案根目錄執行 `node --test netlify/tests/expenses.test.mjs`，在 frontend 目錄執行 `npm ci`、`npm test`、`npm run build`。得到部署許可後，在 Netlify 預覽以一位管理者和一位旅伴實測邀請、登入、權限、寫回 Notion 及資料更新，再發布正式版。Netlify Identity 登入需要部署環境。
