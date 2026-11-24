import { getUser } from "../../frontend/server/expenseIdentity.js";
import { createExpenseHandler } from "../lib/expenses.js";

export default createExpenseHandler({ getUser, env: key => Netlify.env.get(key) });
