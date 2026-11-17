-- Alerte: comenzi noi de pe site și din portalul colaboratorilor, mesaje de la colaboratori, acte încărcate ulterior.
-- Regulile se adaugă o singură dată la cele deja salvate în Setări › Alerte (cine nu a salvat nimic le are din valorile implicite).
UPDATE settings SET value = json_insert(value,
    '$.rules[#]', json('{"id":"r-order-site","kind":"order_site","days":0,"to":["orders","admins"],"scope":[],"dashboard":false,"email":false,"enabled":true}'))
  WHERE key = 'alerts' AND json_valid(value) AND json_type(value, '$.rules') = 'array' AND value NOT LIKE '%"r-order-site"%';
UPDATE settings SET value = json_insert(value,
    '$.rules[#]', json('{"id":"r-order-partner","kind":"order_partner","days":0,"to":["orders","admins"],"scope":[],"dashboard":false,"email":false,"enabled":true}'))
  WHERE key = 'alerts' AND json_valid(value) AND json_type(value, '$.rules') = 'array' AND value NOT LIKE '%"r-order-partner"%';
UPDATE settings SET value = json_insert(value,
    '$.rules[#]', json('{"id":"r-order-msg","kind":"order_msg","days":0,"to":["evaluator","orders"],"scope":[],"dashboard":false,"email":false,"enabled":true}'))
  WHERE key = 'alerts' AND json_valid(value) AND json_type(value, '$.rules') = 'array' AND value NOT LIKE '%"r-order-msg"%';
UPDATE settings SET value = json_insert(value,
    '$.rules[#]', json('{"id":"r-order-doc","kind":"order_doc_added","days":0,"to":["evaluator","orders"],"scope":[],"dashboard":false,"email":false,"enabled":true}'))
  WHERE key = 'alerts' AND json_valid(value) AND json_type(value, '$.rules') = 'array' AND value NOT LIKE '%"r-order-doc"%';
