-- Alerta „Comandă nouă de pe site” pleacă și pe email (bifa „Și pe email” din Setări › Alerte, care se poate scoate oricând).
UPDATE settings SET value = (
    SELECT json_set(settings.value, '$.rules[' || j.key || '].email', json('true'))
    FROM json_each(settings.value, '$.rules') j WHERE json_extract(j.value, '$.id') = 'r-order-site')
  WHERE key = 'alerts' AND json_valid(value) AND json_type(value, '$.rules') = 'array'
    AND EXISTS (SELECT 1 FROM json_each(settings.value, '$.rules') j WHERE json_extract(j.value, '$.id') = 'r-order-site');
