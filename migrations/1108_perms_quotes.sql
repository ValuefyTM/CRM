-- Permisiuni: modulul „Oferte” separat de Comenzi. Rolurile salvate care aveau Comenzi primesc Oferte la fel (vede / adaugă / editează / șterge,
-- „Făcute de el” unde comenzile erau restrânse, trimitere unde aveau „Trimite oferta”, conversie unde puteau adăuga), ca nimeni să nu piardă accesul.
UPDATE settings SET value = json_set(value, '$.roles[0].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[0].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[0].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[0].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[0].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[0].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[0].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[0].cells.orders.on') AND json_extract(value, '$.roles[0].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[1].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[1].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[1].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[1].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[1].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[1].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[1].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[1].cells.orders.on') AND json_extract(value, '$.roles[1].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[2].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[2].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[2].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[2].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[2].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[2].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[2].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[2].cells.orders.on') AND json_extract(value, '$.roles[2].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[3].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[3].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[3].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[3].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[3].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[3].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[3].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[3].cells.orders.on') AND json_extract(value, '$.roles[3].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[4].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[4].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[4].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[4].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[4].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[4].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[4].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[4].cells.orders.on') AND json_extract(value, '$.roles[4].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[5].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[5].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[5].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[5].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[5].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[5].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[5].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[5].cells.orders.on') AND json_extract(value, '$.roles[5].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[6].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[6].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[6].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[6].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[6].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[6].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[6].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[6].cells.orders.on') AND json_extract(value, '$.roles[6].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[7].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[7].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[7].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[7].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[7].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[7].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[7].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[7].cells.orders.on') AND json_extract(value, '$.roles[7].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[8].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[8].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[8].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[8].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[8].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[8].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[8].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[8].cells.orders.on') AND json_extract(value, '$.roles[8].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[9].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[9].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[9].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[9].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[9].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[9].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[9].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[9].cells.orders.on') AND json_extract(value, '$.roles[9].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[10].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[10].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[10].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[10].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[10].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[10].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[10].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[10].cells.orders.on') AND json_extract(value, '$.roles[10].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[11].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[11].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[11].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[11].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[11].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[11].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[11].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[11].cells.orders.on') AND json_extract(value, '$.roles[11].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[12].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[12].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[12].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[12].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[12].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[12].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[12].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[12].cells.orders.on') AND json_extract(value, '$.roles[12].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[13].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[13].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[13].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[13].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[13].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[13].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[13].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[13].cells.orders.on') AND json_extract(value, '$.roles[13].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[14].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[14].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[14].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[14].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[14].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[14].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[14].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[14].cells.orders.on') AND json_extract(value, '$.roles[14].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[15].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[15].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[15].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[15].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[15].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[15].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[15].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[15].cells.orders.on') AND json_extract(value, '$.roles[15].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[16].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[16].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[16].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[16].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[16].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[16].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[16].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[16].cells.orders.on') AND json_extract(value, '$.roles[16].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[17].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[17].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[17].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[17].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[17].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[17].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[17].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[17].cells.orders.on') AND json_extract(value, '$.roles[17].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[18].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[18].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[18].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[18].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[18].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[18].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[18].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[18].cells.orders.on') AND json_extract(value, '$.roles[18].cells.quotes') IS NULL;
UPDATE settings SET value = json_set(value, '$.roles[19].cells.quotes', json_object('on', json('true'),
    'r', json(COALESCE(json_extract(value, '$.roles[19].cells.orders.r'), '[]')),
    'scope', CASE WHEN COALESCE(json_extract(value, '$.roles[19].cells.orders.scope'), CASE WHEN json_extract(value, '$.roles[19].cells.orders.own') THEN 'own' ELSE 'all' END) = 'all' THEN 'all' ELSE 'own' END,
    'sp', json(CASE WHEN COALESCE(json_extract(value, '$.roles[19].cells.orders.sp'), '') LIKE '%"offer"%' THEN CASE WHEN COALESCE(json_extract(value, '$.roles[19].cells.orders.r'), '') LIKE '%"A"%' THEN '["send","convert"]' ELSE '["send"]' END
      ELSE CASE WHEN COALESCE(json_extract(value, '$.roles[19].cells.orders.r'), '') LIKE '%"A"%' THEN '["convert"]' ELSE '[]' END END)))
  WHERE key = 'perms' AND json_valid(value) AND json_extract(value, '$.roles[19].cells.orders.on') AND json_extract(value, '$.roles[19].cells.quotes') IS NULL;
