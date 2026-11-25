export function settleExpenses(members, expenses) {
  let excluded = 0;
  const result = {};
  for (const [currency, scale] of [["JPY", 1], ["TWD", 100]]) {
    const balances = new Map(members.map(({ id }) => [id, 0]));
    for (const expense of expenses.filter(expense => expense.currency === currency)) {
      const participantIds = [...new Set(expense.participantIds)].sort();
      const units = Math.round(expense.amount * scale);
      if (!Number.isSafeInteger(units) || units <= 0 || !participantIds.length ||
          expense.incompleteRelations || !balances.has(expense.payerId) ||
          participantIds.some(id => !balances.has(id))) {
        excluded++;
        continue;
      }
      const share = Math.floor(units / participantIds.length);
      const remainder = units % participantIds.length;
      balances.set(expense.payerId, balances.get(expense.payerId) + units);
      participantIds.forEach((id, index) => {
        balances.set(id, balances.get(id) - share - Number(index < remainder));
      });
    }

    const debtors = [...balances].filter(([, units]) => units < 0).map(([id, units]) => [id, -units]);
    const creditors = [...balances].filter(([, units]) => units > 0);
    const transfers = [];
    let debtor = 0;
    let creditor = 0;
    while (debtor < debtors.length && creditor < creditors.length) {
      const from = debtors[debtor];
      const to = creditors[creditor];
      const units = Math.min(from[1], to[1]);
      transfers.push({ from: from[0], to: to[0], amount: units / scale });
      from[1] -= units;
      to[1] -= units;
      if (!from[1]) debtor++;
      if (!to[1]) creditor++;
    }
    result[currency] = { balances: new Map([...balances].map(([id, units]) => [id, units / scale])), transfers };
  }
  result.excluded = excluded + expenses.filter(expense => !["JPY", "TWD"].includes(expense.currency)).length;
  return result;
}
