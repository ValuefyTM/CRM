-- Raport anulat după ce inspecția s-a făcut: inspecția se poate factura. Raportul rămâne anulat, cu tariful inspecției
-- în locul onorariului (și pe comandă), și apare la „De facturat” ca orice lucrare a contractului facturat din CRM.
ALTER TABLE reports ADD COLUMN cancel_bill INTEGER NOT NULL DEFAULT 0;   -- 1 = se facturează inspecția, deși raportul e anulat
ALTER TABLE reports ADD COLUMN cancel_fee_before REAL;                   -- onorariul de dinaintea anulării (revine la reactivare)
