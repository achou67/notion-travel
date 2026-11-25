function buildSettlement(balances, scale) {
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
  return { balances: new Map([...balances].map(([id, units]) => [id, units / scale])), transfers };
}

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

    result[currency] = buildSettlement(balances, scale);
  }
  result.excluded = excluded + expenses.filter(expense => !["JPY", "TWD"].includes(expense.currency)).length;
  return result;
}

export function settleInTwd(settlement, rate) {
  const match = /^(\d{0,4})(?:\.(\d{1,6}))?$/.exec(rate.trim());
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  const factor = BigInt((whole || "0") + fraction.padEnd(6, "0"));
  if (!factor) return null;

  const divisor = 1_000_000n;
  const cents = new Map();
  const remainders = [];
  let total = 0n;
  for (const [id, yen] of settlement.JPY.balances) {
    const twd = settlement.TWD.balances.get(id);
    const exact = BigInt(yen) * factor * 100n + BigInt(Math.round(twd * 100)) * divisor;
    const remainder = (exact % divisor + divisor) % divisor;
    const roundedDown = (exact - remainder) / divisor;
    cents.set(id, roundedDown);
    remainders.push({ id, remainder });
    total += roundedDown;
  }

  // Assign leftover cents to the largest fractions so all transfers balance.
  remainders.sort((a, b) => a.remainder === b.remainder ? a.id.localeCompare(b.id) : a.remainder > b.remainder ? -1 : 1);
  for (const { id } of remainders.slice(0, Number(-total))) cents.set(id, cents.get(id) + 1n);
  const balances = new Map([...cents].map(([id, amount]) => [id, Number(amount)]));
  if ([...balances.values()].some(amount => !Number.isSafeInteger(amount))) return null;
  return buildSettlement(balances, 100);
}
