import { createExpenseAuth } from "../server/expenseAuth.js";

const handler = createExpenseAuth();
export { handler as GET, handler as POST };
