const { normalizeEmail } = require('./emailNormalize');

function valuesEqual(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function dedupeContactItems(items) {
  const result = [];
  items.forEach((item) => {
    const value = String(item.value || '').trim();
    if (!value) return;
    const duplicate = result.some((existing) => valuesEqual(existing.value, value));
    if (duplicate) return;
    result.push({ label: item.label, value: item.displayValue ?? value });
  });
  return result;
}

function buildPartyAContactsDisplay(enriched) {
  const info = enriched.party_a_info || {};
  const loginEmail = normalizeEmail(info.email);

  const items = dedupeContactItems([
    { label: 'Company', value: enriched.company_name || info.organization_name },
    { label: 'Contact Person', value: info.contact_name },
    { label: 'Organization', value: info.organization_name },
    { label: 'Designation', value: info.designation },
    { label: 'Email', value: loginEmail, displayValue: loginEmail },
    { label: 'Phone', value: info.phone },
    { label: 'Country', value: info.country },
    { label: 'City', value: info.city },
  ]);

  return {
    items,
    login_email: loginEmail || null,
  };
}

function buildPartyBContactsDisplay(enriched) {
  const info = enriched.party_b_info || {};
  const loginEmail = normalizeEmail(info.email || enriched.party_b_email);

  const items = dedupeContactItems([
    { label: 'Company', value: enriched.venture_name || info.organization_name },
    { label: 'Contact Person', value: info.contact_name },
    { label: 'Organization', value: info.organization_name },
    { label: 'Designation', value: info.designation },
    { label: 'Department / Ministry', value: info.department_ministry },
    { label: 'Email', value: loginEmail, displayValue: loginEmail },
    { label: 'Phone', value: info.phone },
    { label: 'Country', value: info.country },
    { label: 'City', value: info.city },
  ]);

  return {
    items,
    login_email: loginEmail || null,
  };
}

module.exports = {
  buildPartyAContactsDisplay,
  buildPartyBContactsDisplay,
  dedupeContactItems,
};
