import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { contractDoc } from "@/lib/contract-doc";
import { DELIVERABLES, FIRM, PURPOSE_BOXES, purposeKey, VALUE_TYPES } from "@/lib/contract-terms";
import { SIGNATURE, STAMP } from "@/lib/firm-assets";
import { DocToolbar } from "./DocToolbar";

export const metadata: Metadata = { title: "Contract de prestări servicii | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "____________");
const money = (n: number | null) => (n == null ? "__________" : n.toLocaleString("ro-RO", { maximumFractionDigits: 2 }));
const Box = ({ on }: { on: boolean }) => <span className="cdBox" aria-label={on ? "bifat" : "nebifat"}>{on ? "☒" : "☐"}</span>;
const upper = (s: string | null | undefined) => (s ?? "").toLocaleUpperCase("ro-RO");

/**
 * The service contract of VALUEFY (classic contract), printable / saved as PDF from the browser: general conditions
 * (with the personal data chapter), Annex 1 — special conditions and the terms of reference of the valuation — and
 * Annex 2 — financial conditions. Filled in from the contract, its client, its reports and their assets.
 */
export default async function ContractDocument({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semnatura?: string }> }) {
  const { db, base } = await staffPage();
  const { id } = await params;
  const d = await contractDoc(db, id);
  if (!d) notFound();
  const k = d.contract, pay = d.payment;
  const signed = (await searchParams).semnatura !== "0";
  // Some clients imported from Glide are firms recorded as persons: the legal form in the name tells.
  const company = k.client_kind !== "person" || /\b(S\.?R\.?L|S\.?A|PFA|S\.?C\.?S|S\.?N\.?C|II|IF)\.?$|\bSRL\b/i.test((k.client ?? "").trim());
  const client = upper(k.client) || "____________________";
  const number = k.number ?? "____";
  const date = day(k.signed_on);
  const many = d.annexes.length > 1;
  const address = [k.billing_address, k.city, k.county && `Jud. ${k.county}`].filter(Boolean).join(", ");

  const Signatures = () => (
    <div className="cdSign">
      <div>
        <b>EVALUATOR:</b><span>{FIRM.name}</span><small>prin {FIRM.rep}, {FIRM.repRole}</small>
        {signed && <span className="cdSeal"><img src={STAMP} alt="Ștampilă VALUEFY" className="cdStamp" /><img src={SIGNATURE} alt="Semnătură" className="cdSig" /></span>}
      </div>
      <div><b>CLIENT:</b><span>{client}</span>{company && k.rep && <small>prin {k.rep}</small>}<span className="cdSignLine" /></div>
    </div>
  );
  const Head = () => (
    <header className="cdHead">
      <img src="/valuefy-logo.png" alt="VALUEFY" />
      <span>Contract de prestări servicii nr. {number} / {date}</span>
    </header>
  );

  return (
    <div className="cdWrap">
      <DocToolbar back={`${base}/contracte/${k.id}`} signed={signed} self={`${base}/contracte/${k.id}/document`} kind={k.kind} />
      {k.kind === "framework" && <div className="cdWarn">Acesta este un contract cadru: documentul de mai jos e modelul de contract clasic și nu se potrivește acordului cu banca.</div>}

      {/* ---------- General conditions ---------- */}
      <article className="cdPage">
        <Head />
        <h1>CONTRACT DE PRESTĂRI SERVICII</h1>
        <p className="cdLead">Prezentul contract de prestări servicii are numărul <b>{number}</b> și a fost încheiat în data de <b>{date}</b>, între:</p>
        <div className="cdParties">
          <section>
            <h3>EVALUATORUL</h3>
            <b>{FIRM.name}</b>
            <dl>
              <dt>Sediul social</dt><dd>{FIRM.address}</dd>
              <dt>CUI</dt><dd>{FIRM.cui}</dd>
              <dt>Nr. înmatriculare</dt><dd>{FIRM.reg}</dd>
              <dt>IBAN</dt><dd>{FIRM.iban}</dd>
              <dt>Reprezentant</dt><dd>{FIRM.rep}, {FIRM.repRole}</dd>
            </dl>
          </section>
          <section>
            <h3>CLIENTUL</h3>
            <b>{client}</b>
            <dl>
              <dt>{company ? "Sediul / adresa de facturare" : "Adresa de facturare"}</dt><dd>{address || "—"}</dd>
              {company ? <><dt>CUI</dt><dd>{k.cui || "—"}</dd><dt>Nr. înregistrare</dt><dd>{k.reg_no || "—"}</dd><dt>Reprezentant</dt><dd>{k.rep || "—"}</dd></>
                : <><dt>Telefon</dt><dd>{k.phone || "—"}</dd><dt>Email</dt><dd>{k.email || "—"}</dd></>}
            </dl>
          </section>
        </div>

        <h2>1. DEFINIȚII</h2>
        <p>Entitățile definite mai sus vor fi denumite în mod individual „Partea” și în mod colectiv „Părțile”. În vederea aplicării prezentului Contract și a documentelor care îl completează sau îl însoțesc, definițiile utilizate vor avea următorul înțeles:</p>
        <ul className="cdDefs">
          <li><b>„raport de evaluare”</b> – un raport care comunică destinatarului / utilizatorului desemnat o concluzie asupra valorii și elementele relevante asociate acesteia (Standardele de evaluare a bunurilor – Glosar 2025). Acesta intră în categoria livrabilelor;</li>
          <li><b>„date și/sau informații”</b> – totalitatea datelor și informațiilor comunicate între Părți, inclusiv date cu caracter personal, astfel cum rezultă din documente sau alte surse, rapoarte, corespondență scrisă;</li>
          <li><b>„date cu caracter personal”</b> – orice informații privind o persoană fizică identificată sau identificabilă, în sensul Regulamentului (UE) 2016/679 („GDPR”), furnizate de Părți sau colectate în executarea Contractului. Acestea se referă, fără a se limita la: nume, prenume, adresa de domiciliu / reședință, adresa de corespondență electronică, număr de telefon, CNP, datele actului de identitate, identificatorul contului bancar, datele din cartea funciară, adresa / localizarea bunurilor aflate în proprietatea Clientului și care vor fi supuse evaluării, precum și fotografiile realizate la inspecție.</li>
        </ul>

        <h2>2. CONTRACTUL ȘI OBIECTUL CONTRACTULUI</h2>
        <p>2.1. Termenii și condițiile prestării serviciilor sunt reglementate prin Condițiile generale, Condițiile speciale (Anexa 1{many ? `, câte o anexă pentru fiecare raport contractat: 1.1–1.${d.annexes.length}` : ""}), Condițiile financiare (Anexa 2) și celelalte anexe, denumite în continuare, împreună, „Contractul”.</p>
        <p>2.2. Serviciile pe care le poate presta EVALUATORUL sunt: evaluarea bunurilor imobile; evaluarea bunurilor mobile; evaluarea întreprinderilor / afacerilor; verificarea evaluărilor; servicii conexe evaluării; consultanță de specialitate.</p>
        <p>2.3. Obiectul Contractului îl reprezintă prestarea de către EVALUATOR a serviciilor solicitate de CLIENT, în condițiile și termenii prezentului Contract (denumite în continuare „Serviciile”), în schimbul achitării de către CLIENT, la termen și în integralitate, a prețului Contractului.</p>
        <p>2.4. Pentru fiecare dintre serviciile contractate se completează Condițiile speciale și anexele aferente. În cazul în care apar neconcordanțe între Condițiile speciale și Condițiile generale, au întâietate Condițiile speciale, astfel cum sunt prevăzute în Anexa 1.</p>

        <h2>3. TERMENELE CONTRACTULUI</h2>
        <p>3.1. Contractul intră în vigoare la data semnării lui de către ambele Părți și este valabil până la stingerea obligațiilor Părților.</p>
        <p>3.2. Termenele de livrare a serviciilor se calculează în zile lucrătoare. Pentru fiecare serviciu se stabilește un termen de livrare, specificat în Condițiile speciale. Pentru mai multe servicii se poate agrea un termen de livrare global, menționat în clar, fără defalcarea termenelor pentru fiecare serviciu; în acest caz, termenul de livrare este același pentru toate serviciile comandate.</p>
        <p>3.3. Respectarea datelor și a termenelor-limită stabilite reprezintă o obligație contractuală esențială a EVALUATORULUI. EVALUATORUL va informa CLIENTUL de îndată cu privire la orice întârziere estimată sau efectivă și va specifica în mod explicit circumstanțele acesteia. O astfel de notificare exonerează EVALUATORUL de răspunderea pentru daune dacă întârzierea a fost provocată în mod demonstrabil din culpa CLIENTULUI, de un eveniment de forță majoră sau din orice alt motiv care nu poate fi imputat EVALUATORULUI.</p>
        <p>3.4. Orice modificare a termenelor se face cu acordul prealabil și scris al ambelor Părți.</p>

        <h2>4. PREDAREA</h2>
        <p>4.1. Predarea livrabilelor se face prin semnarea unui proces-verbal de predare-primire de către reprezentanții ambelor Părți sau prin transmiterea acestora prin poștă electronică, conform art. 4.4.</p>
        <p>4.2. În cazul în care se solicită ca livrabilele să fie tipărite, numărul de exemplare și modalitatea de predare se stabilesc prin Condițiile speciale.</p>
        <p>4.3. Predarea este condiționată de plata integrală a prețului determinat conform Anexei 2 – Condiții financiare.</p>
        <p>4.4. CLIENTUL este de acord să primească rapoartele de evaluare și facturile aferente executării prezentului Contract prin poștă electronică (e-mail), în format .pdf, cu semnătură electronică încorporată. Acestea constituie dovada transmiterii și a executării obligațiilor EVALUATORULUI față de CLIENT.</p>

        <h2>5. CONDIȚII DE PLATĂ</h2>
        <p>5.1. <b>Facturi.</b> Cu excepția cazului în care se convine altfel, facturile se plătesc în lei (RON). Dacă prețul este convenit într-o monedă străină, cursul de schimb este cursul Băncii Naționale a României valabil la data emiterii facturii, conform prevederilor legale. Comunicarea facturilor se face prin e-mail și/sau prin poștă, cu respectarea prevederilor legale aplicabile.</p>
        <p>5.2. <b>Plata.</b> Termenul de plată al facturilor emise de EVALUATOR este cel stabilit de Părți prin Anexa 2 – Condiții financiare. Plata se consideră efectuată la timp dacă dispoziția de plată este transmisă băncii de către CLIENT cel mai târziu în ultima zi a termenului de plată specificat pe factură.</p>
        <p>5.3. <b>Penalități.</b> Dacă EVALUATORUL nu primește o sumă datorată în baza prezentului Contract până la data scadentă, CLIENTUL va plăti penalități de întârziere de 0,1% pe zi de întârziere, calculate la suma datorată, de la data scadentă și până la data primirii integrale a plății. CLIENTUL este pus în întârziere de drept, fără nicio notificare sau formalitate prealabilă.</p>

        <h2>6. OBLIGAȚIILE PĂRȚILOR</h2>
        <p>6.1. <b>Obligațiile EVALUATORULUI:</b> 6.1.1. să presteze Serviciile conform reglementărilor legale și Standardelor de evaluare ANEVAR în vigoare; 6.1.2. să livreze serviciile comandate de CLIENT, în termenii și condițiile prezentului Contract; 6.1.3. să păstreze confidențialitatea datelor și să prelucreze datele cu caracter personal conform capitolului 8.</p>
        <p>6.2. <b>Obligațiile CLIENTULUI:</b> 6.2.1. să răspundă cu promptitudine solicitărilor EVALUATORULUI privind documentele și informațiile necesare prestării Serviciilor; 6.2.2. să permită accesul fizic al persoanelor desemnate de EVALUATOR pentru inspecția bunurilor subiect, la datele stabilite de comun acord, dacă natura serviciilor o impune; 6.2.3. să achite contravaloarea Serviciilor în condițiile și cuantumul din Condițiile financiare; 6.2.4. să achite penalitățile datorate conform Contractului; 6.2.5. să nu încalce independența evaluatorului prin impunerea unui rezultat prestabilit al evaluării sau în orice alt mod.</p>

        <h2>7. CONFIDENȚIALITATE ȘI PUBLICITATE</h2>
        <p>7.1. Fiecare Parte va trata toate informațiile primite de la cealaltă Parte sau de la terți în legătură cu executarea Contractului, indiferent dacă au fost obținute înainte sau după încheierea acestuia, cu strictă confidențialitate, și le va utiliza exclusiv pentru îndeplinirea obligațiilor sale contractuale.</p>
        <p>7.2. Dacă anumite informații trebuie comunicate unor terți în scopul executării Contractului, Partea care le comunică va obține în prealabil de la acești terți asumarea păstrării confidențialității în condiții cel puțin la fel de protectoare ca cele din prezentul Contract.</p>
        <p>7.3. Informațiile de orice natură – date, afaceri și informații privind structura afacerilor, programe informatice și documentații, scrise sau orale („Informații”) – sunt și rămân în proprietatea Părții care le-a furnizat.</p>
        <p>7.4. Niciuna dintre Părți nu va dezvălui unei terțe persoane, fără consimțământul scris al celeilalte, informații confidențiale primite ca rezultat al furnizării serviciilor sau cu privire la Contractul însuși.</p>
        <p>7.5. Informațiile și datele (inclusiv cele cu caracter personal) comunicate între Părți sau de care acestea au luat cunoștință pe durata Contractului sunt confidențiale și se folosesc doar în scopul pentru care au fost transmise și în folosul Contractului, cu excepția cazului în care: 7.5.1. erau publice sau cunoscute Părții care le-a primit printr-un canal public înainte de a-i fi comunicate; sau 7.5.2. dezvăluirea este cerută de lege, de o hotărâre judecătorească sau de o autoritate competentă, caz în care Partea căreia i se solicită dezvăluirea va anunța imediat cealaltă Parte.</p>
        <p>7.6. Niciuna dintre Părți nu va publica materiale, articole, reclame (inclusiv online) despre lucrări sau mențiuni care atestă implicarea celeilalte Părți ori a personalului acesteia, fără consimțământul prealabil scris al celeilalte Părți.</p>
        <p>7.7. Nicio Parte nu răspunde dacă informațiile confidențiale ajung la cunoștința terților fără vina sa.</p>

        <h2>8. PROTECȚIA DATELOR CU CARACTER PERSONAL (GDPR)</h2>
        <p>8.1. <b>Rolul Părților.</b> Fiecare Parte acționează ca operator independent pentru datele cu caracter personal pe care le prelucrează în legătură cu prezentul Contract, cu respectarea Regulamentului (UE) 2016/679 („GDPR”) și a Legii nr. 190/2018.</p>
        <p>8.2. <b>Datele prelucrate de EVALUATOR.</b> Datele de identificare și de contact ale CLIENTULUI, ale reprezentanților și persoanelor de contact ale acestuia; datele privind bunurile evaluate și proprietarii acestora (extrase de carte funciară, documentații cadastrale, acte de proprietate); fotografiile și notițele realizate la inspecție; datele de facturare și plată.</p>
        <p>8.3. <b>Scopuri și temei legal.</b> Datele sunt prelucrate: (a) pentru încheierea și executarea Contractului – inspecția, elaborarea și livrarea raportului, comunicarea cu CLIENTUL (art. 6 alin. (1) lit. b) GDPR); (b) pentru îndeplinirea obligațiilor legale – facturare, evidență financiar-contabilă, păstrarea dosarului de lucru al evaluării și verificarea acestuia conform OG 24/2011 și reglementărilor ANEVAR (art. 6 alin. (1) lit. c) GDPR); (c) pentru constatarea, exercitarea sau apărarea unor drepturi în instanță (art. 6 alin. (1) lit. f) GDPR). Prelucrarea nu se întemeiază pe consimțământ și nu presupune decizii automate sau profilare.</p>
        <p>8.4. <b>Destinatari.</b> Datele pot fi comunicate, strict în măsura necesară: evaluatorilor autorizați și colaboratorilor EVALUATORULUI care participă la misiune, ținuți de obligația de confidențialitate; utilizatorilor desemnați ai raportului (Anexa 1, pct. B.3); comisiilor de specialitate ale ANEVAR, la verificarea rapoartelor; autorităților publice, la cererea acestora, în condițiile legii; furnizorilor de servicii informatice, de găzduire, de curierat și de contabilitate, în baza unor contracte care asigură protecția datelor. Datele nu sunt transferate în afara Spațiului Economic European.</p>
        <p>8.5. <b>Durata stocării.</b> Datele se păstrează pe durata executării Contractului și ulterior pe durata impusă de obligațiile legale de arhivare (reglementările ANEVAR privind dosarul de lucru al evaluării și legislația financiar-contabilă), respectiv pe durata termenului de prescripție pentru eventuale pretenții, după care sunt șterse sau anonimizate.</p>
        <p>8.6. <b>Drepturile persoanelor vizate.</b> Persoanele vizate au dreptul de acces, de rectificare, de ștergere, de restricționare a prelucrării, de portabilitate și de opoziție, în condițiile GDPR, precum și dreptul de a depune plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (www.dataprotection.ro). Cererile se adresează EVALUATORULUI la {FIRM.email} sau la adresa de corespondență din capitolul 11.</p>
        <p>8.7. <b>Obligațiile CLIENTULUI.</b> CLIENTUL garantează că datele cu caracter personal ale altor persoane pe care le transmite EVALUATORULUI (coproprietari, chiriași, persoane de contact la inspecție, reprezentanți) sunt exacte, au fost obținute legal și că aceste persoane au fost informate cu privire la transmiterea datelor către EVALUATOR în scopurile de mai sus. Inspecția spațiilor locuite se face cu acordul persoanelor care le folosesc; fotografiile se realizează doar în scopul evaluării, evitându-se pe cât posibil persoanele și obiectele personale.</p>
        <p>8.8. <b>Securitate și incidente.</b> Fiecare Parte aplică măsuri tehnice și organizatorice adecvate pentru protejarea datelor (acces restricționat, parole, criptarea transmisiilor, instruirea personalului) și va informa cealaltă Parte, fără întârzieri nejustificate, despre orice incident de securitate care afectează datele primite de la aceasta.</p>

        <h2>9. AMENDAMENTE LA CONTRACT</h2>
        <p>9.1. Orice amendamente ale Contractului se fac prin acte adiționale scrise, care intră în vigoare doar dacă sunt semnate de reprezentanții autorizați ai Părților.</p>

        <h2>10. ÎNCETAREA CONTRACTULUI</h2>
        <p>10.1. Contractul poate înceta: a) de comun acord; b) prin denunțare unilaterală, în termen de 5 zile de la primirea notificării scrise de către cealaltă Parte, drepturile și obligațiile contractuale rămânând nemodificate pe durata acestor 5 zile; c) la inițiativa oricărei Părți, dacă un caz de forță majoră durează mai mult de 30 de zile consecutive, printr-o notificare transmisă cu 5 zile lucrătoare înainte de rezilierea efectivă; d) de plin drept, fără formalități prealabile sau intervenția instanței, după primirea notificării scrise a CLIENTULUI, dacă autorizațiile EVALUATORULUI necesare executării Contractului sunt retrase, anulate sau constatate nule; e) în cazul neîndeplinirii, al îndeplinirii nesatisfăcătoare sau cu întârziere a obligațiilor de către o Parte, după notificarea scrisă a celeilalte Părți și acordarea unei perioade de grație; dacă situația nu este remediată în 10 zile calendaristice de la primirea notificării, Partea reclamantă poate rezilia Contractul de plin drept, fără intervenția instanței.</p>
        <p>10.2. Dacă Contractul încetează din culpa EVALUATORULUI sau este denunțat unilateral de acesta, EVALUATORUL va restitui CLIENTULUI sumele primite cu titlu de preț al Serviciilor. Dacă Contractul încetează din culpa CLIENTULUI sau este denunțat unilateral de acesta înainte de inspecția bunurilor subiect, CLIENTUL va plăti EVALUATORULUI o compensație pentru serviciile prestate până la încetare; dacă notificarea de încetare ajunge la EVALUATOR după inspecția bunurilor, EVALUATORUL este îndreptățit să primească integral prețul Contractului.</p>

        <h2>11. NOTIFICĂRI</h2>
        <p>11.1. Notificările, cererile, aprobările și celelalte comunicări între Părți se fac în scris și se transmit personal, prin curier sau prin e-mail (document semnat și scanat ori semnat electronic), la datele de contact de mai jos. Notificarea predată personal sau prin curier se consideră primită la data livrării; cea transmisă prin e-mail, în prima zi lucrătoare după transmitere; cea transmisă prin poștă, la 48 de ore de la expediere, dovedită prin plicul ștampilat și timbrat corespunzător.</p>
        <p>11.2. CLIENTUL este de acord să primească prin e-mail comunicări tehnice și comerciale legate de Contract (inclusiv înștiințări de plată). Orice mesaj al EVALUATORULUI va conține numele expeditorului și datele sale de contact.</p>
        <p>11.3. Datele de contact ale Părților se folosesc pentru notificări și comunicarea dintre Părți, conform capitolului 8. Orice modificare a datelor de contact se comunică celeilalte Părți în cel mult 24 de ore.</p>
        <div className="cdContacts">
          <div><b>{FIRM.name}</b><span>Adresa de corespondență: {FIRM.mail}</span><span>Telefon: {FIRM.phone}</span><span>E-mail: {FIRM.email}</span></div>
          <div><b>CLIENT: {client}</b><span>Adresa de corespondență: {address || "cea din identificarea Părților"}</span><span>Telefon: {k.phone || "—"}</span><span>E-mail: {k.email || "—"}</span></div>
        </div>

        <h2>12. FORȚA MAJORĂ</h2>
        <p>12.1. Forța majoră este o circumstanță sau un eveniment excepțional care este mai presus de controlul Părții, de care aceasta nu s-a putut apăra în mod rezonabil înainte de încheierea Contractului, pe care, după ce s-a ivit, nu l-a putut evita sau depăși în mod rezonabil și care nu este în mod substanțial atribuibil celeilalte Părți.</p>
        <p>12.2. Pe durata forței majore, Părțile nu își datorează penalități, daune sau compensații, cu excepția cazului în care circumstanțele au fost determinate de Partea căreia i se pretind. Partea afectată va notifica imediat cealaltă Parte; la cerere, va dovedi forța majoră în 15 zile calendaristice, printr-un certificat emis de Camera de Comerț și Industrie a României. Dacă forța majoră durează mai mult de 30 de zile calendaristice, oricare Parte poate rezilia Contractul printr-o notificare cu efect imediat.</p>

        <h2>13. INTERDICȚIA CESIONĂRII. SUBCONTRACTARE</h2>
        <p>13.1. Fără acordul scris al celeilalte Părți, nicio Parte nu va cesiona sau subcontracta Contractul, parțial sau integral, unor terți.</p>

        <h2>14. DECLARAȚII ȘI GARANȚII</h2>
        <p>14.1. Fiecare Parte declară și garantează că: Contractul reprezintă o obligație valabilă și angajantă; nu se află în stare de necesitate, în sensul art. 1218 din Codul civil; încheierea și executarea Contractului nu încalcă prevederi legale sau acte administrative și nu necesită aprobarea unor terți; semnatarii sunt pe deplin împuterniciți să semneze Contractul; își asumă îndeplinirea integrală a obligațiilor ce rezultă din Contract.</p>
        <p>14.2. CLIENTUL declară că nu se află în stare de insolvabilitate sau incapacitate de plată; declarațiile necorespunzătoare realității atrag răspunderea în condițiile legii.</p>

        <h2>15. CLAUZA PENALĂ</h2>
        <p>15.1. Orice utilizare, distribuire, reproducere sau publicare în afara condițiilor din Anexa 1{many ? " (oricare dintre anexele 1.x)" : ""}, pct. B.11 „Restricții de utilizare, difuzare sau publicare”, atrage răspunderea directă a CLIENTULUI, iar EVALUATORUL este îndreptățit la daune-interese egale cu prețul Contractului, pentru fiecare situație în parte, cu titlu de daune compensatorii conform art. 1538 din Codul civil.</p>

        <h2>16. LEGISLAȚIA APLICABILĂ</h2>
        <p>16.1. Contractul, inclusiv încheierea, valabilitatea și executarea sa, este guvernat de legislația română.</p>

        <h2>17. JURISDICȚIE</h2>
        <p>17.1. Orice dispută privind încheierea, interpretarea, executarea, modificarea sau încetarea Contractului se soluționează pe cale amiabilă, prin conciliere directă sau mediere. Dacă disputa nu se soluționează amiabil într-un termen de cel puțin 30 de zile calendaristice, Partea interesată se poate adresa instanțelor judecătorești competente din {FIRM.court}.</p>

        <h2>18. NULITATEA UNOR PREVEDERI</h2>
        <p>18.1. Dacă o instanță competentă constată că o prevedere a Contractului este nelegală, nevalabilă sau neexecutorie, celelalte prevederi rămân valabile, iar Părțile vor conveni asupra unei prevederi alternative, valabile și executorii, cu efect cât mai apropiat. Renunțarea unei Părți la termeni sau prevederi ale Contractului produce efecte doar dacă este făcută în scris și semnată de acea Parte.</p>

        <h2>19. INTEGRALITATEA CONTRACTULUI</h2>
        <p>19.1. Contractul, împreună cu anexele sale, reprezintă întregul acord al Părților, înlocuiește orice înțelegeri anterioare cu același obiect și se poate modifica doar în scris, cu semnătura Părților. Contractul a fost încheiat astăzi, {date}, în 2 (două) exemplare originale, câte unul pentru fiecare Parte, sau în format electronic, semnat cu semnătură electronică.</p>
        <Signatures />
      </article>

      {/* ---------- Annex 1 ---------- */}
      {d.annexes.map((x) => {
        const t = x.terms;
        const pk = purposeKey(x.purpose);
        const other = !pk && x.purpose ? x.purpose : null;
        const vt = VALUE_TYPES.find(([key]) => key === t.value_type) ?? VALUE_TYPES[0];
        const deliverable = DELIVERABLES.find(([key]) => key === t.deliverable)?.[0] ?? "raport";
        const sharedAssets = x.assets.filter((a) => a.shared);
        return (
      <article className="cdPage" key={x.n}>
        <Head />
        <h1>ANEXA {many ? `1.${x.n}` : "1"} – CONDIȚII SPECIALE</h1>
        {many && <p className="cdLead"><b>Raportul {x.n} din {d.annexes.length}{x.purpose ? ` · ${x.purpose}` : ""}</b>{x.number ? ` · nr. ${x.number}` : ""}</p>}
        <p className="cdLead">Prevederile prezentelor Condiții speciale se completează cu Condițiile generale și Condițiile financiare, împreună alcătuind Contractul.</p>
        <h2>A. SERVICIILE</h2>
        <h3>1. Serviciul contractat</h3>
        <p>La cererea Clientului au fost contractate următoarele servicii:</p>
        <ul className="cdChecks">
          <li><Box on={x.services.immovable} /> Evaluarea bunurilor imobile</li>
          <li><Box on={x.services.movable} /> Evaluarea bunurilor mobile</li>
          <li><Box on={false} /> Evaluarea întreprinderilor / afacerilor</li>
          <li><Box on={false} /> Verificarea evaluărilor</li>
        </ul>
        <h3>2. Livrabile. Condiții de livrare</h3>
        <p>2.1. În urma prestării Serviciului, livrabilele sunt următoarele:</p>
        <ul className="cdChecks">
          <li><Box on={deliverable === "raport"} /> Raport de evaluare{deliverable === "raport" && <> – număr rapoarte: <b>{t.reports}</b></>}</li>
          <li><Box on={deliverable === "nop"} /> Notă de opinie asupra valorii (NOP): cu inspecție <Box on={deliverable === "nop" && t.nop_inspection} /> fără inspecție <Box on={deliverable === "nop" && !t.nop_inspection} /></li>
          <li><Box on={deliverable === "nip"} /> Notă de inspecție a proprietății (NIP)</li>
        </ul>
        <p>2.2. Livrabilul va fi semnat cu semnătura electronică a EVALUATORULUI și va fi considerat exemplar original.</p>
        <p>2.3. Livrarea se face prin poștă electronică.</p>
        <p>2.4. Termenul de livrare este de <b>{t.term_days} {t.term_days === 1 ? "zi lucrătoare" : "zile lucrătoare"}</b> de la data realizării inspecției fizice a proprietății și a primirii tuturor informațiilor.</p>
        <p>2.5. La solicitarea scrisă a Clientului, livrabilele pot fi tipărite și livrate prin curier{pay.print ? ` (${pay.print})` : ""}. Costurile de tipărire și curierat sunt suportate de Client, suplimentar față de prețul din Anexa 2, și se evidențiază în factura emisă de EVALUATOR.</p>

        <h2>B. TERMENII DE REFERINȚĂ AI EVALUĂRII</h2>
        <h3>1. Identificarea obiectului evaluării</h3>
        <table className="cdTable">
          <thead><tr><th>Nr.</th><th>Tip bun</th><th>Nr. de identificare</th><th>Adresa / amplasament</th></tr></thead>
          <tbody>
            {x.assets.length ? x.assets.map((a, i) => <tr key={i}><td>{i + 1}.</td><td>{a.type}{a.shared && <small className="cdNote"> · inspecție comună</small>}</td><td>{a.ids}</td><td>{a.address}</td></tr>)
              : <tr><td>1.</td><td colSpan={3} className="cdBlank">bunurile se completează la crearea raportului</td></tr>}
          </tbody>
        </table>
        <h3>2. Identificarea și competența evaluatorului</h3>
        <p>2.1. {FIRM.name} (EVALUATORUL) este membru corporativ ANEVAR, înscris în Tabloul membrilor corporativi cu nr. de autorizație {FIRM.anevar}, calitate dobândită în condițiile OG nr. 24/2011 privind unele măsuri în domeniul evaluării bunurilor, și are dreptul de a contracta și presta servicii de evaluare a bunurilor.</p>
        <p>2.2. Nici EVALUATORUL, nici evaluatorii semnatari ai raportului nu au vreo legătură sau vreun interes special cu privire la obiectul evaluării sau la Client.</p>
        <p>2.3. Rezultatele prezentate în raport nu se bazează pe solicitarea obținerii unei anumite valori, venită din partea Clientului sau a altor persoane interesate, iar remunerarea evaluării nu depinde de satisfacerea unei asemenea solicitări.</p>
        <p>2.4. EVALUATORUL, împreună cu evaluatorii autorizați semnatari, își asumă responsabilitatea pentru rezultatele și concluziile raportului, opinia asupra valorii fiind obiectivă și imparțială.</p>
        <h3>3. Identificarea clientului și a utilizatorilor</h3>
        <p>Client: <Box on={!company} /> Persoană fizică <Box on={company} /> Persoană juridică – <b>{client}</b></p>
        <p>3.1. Utilizatori desemnați: <b>{t.users || client}</b></p>
        <p>3.2. Alte persoane (fizice sau juridice) care au acces la raportul de evaluare: {t.others}</p>
        <p>3.3. Accesul altor persoane la raport, în afara Clientului și a utilizatorilor desemnați, exclude orice răspundere a evaluatorului față de acestea: persoana care primește o copie a raportului nu devine utilizator desemnat decât dacă este autorizată de evaluator și identificată explicit ca atare și nu este îndreptățită la nicio pretenție față de evaluator sau față de EVALUATOR.</p>
        <p>3.4. Forma și conținutul raportului țin seama de persoanele pentru care se realizează evaluarea, pentru ca acesta să conțină informații adecvate necesităților lor.</p>
        <h3>4. Scopul evaluării</h3>
        <p>4.1. Evaluarea este cerută de Client pentru:</p>
        <ul className="cdChecks cdCols">
          {PURPOSE_BOXES.map(([key, label]) => <li key={key}><Box on={pk === key} /> {label}</li>)}
          {other && <li><Box on /> {other}</li>}
        </ul>
        <p>4.2. Evaluarea nu poate fi utilizată în afara contextului sau în alte scopuri decât cel selectat la pct. 4.1.</p>
        <h3>5. Tipul valorii</h3>
        <p>5.1. În acord cu scopul evaluării, valoarea estimată pentru bunurile identificate la pct. B.1 va fi:</p>
        <ul className="cdChecks cdCols">{VALUE_TYPES.map(([key, label]) => <li key={key}><Box on={key === vt[0]} /> {label}</li>)}</ul>
        <p className="cdDef"><b>Definiție ({vt[1].toLowerCase()}):</b> {vt[2]}</p>
        <h3>6. Drepturi de proprietate</h3>
        <p>6.1. Se supune evaluării dreptul de proprietate asupra bunurilor identificate la pct. B.1.</p>
        <h3>7. Data evaluării</h3>
        <p>7.1. Valorile estimate vor fi emise în condițiile pieței specifice de la data evaluării. 7.2. Data evaluării / data de referință este {deliverable === "nop" && !t.nop_inspection ? "data emiterii notei de opinie" : "data inspecției"}.</p>
        <h3>8. Documentarea pentru elaborarea evaluării</h3>
        <p>8.1. Evaluarea include toate cercetările, informațiile, raționamentele, analizele și concluziile necesare pentru a ajunge la valoarea estimată. 8.2. {t.limitations}</p>
        {sharedAssets.length > 0 && <p>8.3. Bunurile marcate „inspecție comună” sunt evaluate și în alt raport din prezentul Contract: inspecția lor se realizează o singură dată, iar constatările și fotografiile de la inspecție sunt folosite în ambele rapoarte.</p>}
        <h3>9. Natura și sursa informațiilor pe care se va baza evaluarea</h3>
        <p>9.1. Evaluatorul va utiliza informații specifice tipului de bun și scopului evaluării, după cum urmează: 9.1.1. furnizate de Client: {t.sources}; 9.1.2. din surse de piață: analize, studii, informații și statistici din mediul online, din publicații de specialitate sau furnizate de terți.</p>
        <h3>10. Ipoteze și ipoteze speciale</h3>
        <p>10.1. <b>Ipoteze</b> – aspecte acceptate în mod rezonabil ca fapte în contextul evaluării, fără a fi documentate sau verificate în mod specific: 10.1.1. valoarea se estimează în ipoteza că nu există costuri legate de responsabilitățile de mediu sau de conformarea la cerințele legale; evaluatorul nu răspunde pentru contaminări sau efecte asupra mediului pe care nu le-a putut identifica în mod rezonabil și despre care Clientul nu l-a informat; 10.1.2. evaluatorul nu efectuează expertize tehnice de detaliu și nu inspectează părțile inaccesibile sau acoperite, care se consideră în stare tehnică bună, fără a se valida integritatea acestora; 10.1.3. dimensiunile și detaliile din raport se consideră corecte și se bazează pe informațiile furnizate de Client și/sau producător; 10.1.4. Clientul răspunde pentru legalitatea, veridicitatea și acuratețea informațiilor furnizate; EVALUATORUL nu are calitatea și competența de a verifica aceste aspecte; 10.1.5. EVALUATORUL efectuează proceduri limitate pentru a determina rezonabilitatea și consistența informațiilor primite; 10.1.6. Contractul nu include modificarea sau actualizarea evaluării pe baza informațiilor sau evenimentelor apărute după livrarea raportului.</p>
        <p>10.2. <b>Ipoteze speciale</b> – ipoteze care presupun date diferite de cele reale de la data evaluării sau pe care un participant tipic de pe piață nu le-ar presupune: {t.special}</p>
        <p>10.3. Evaluatorul poate completa ipotezele de mai sus pe parcursul misiunii, doar după înștiințarea Clientului și obținerea acordului scris al acestuia. Dacă Clientul nu este de acord, iar evaluatorul consideră că fără aceste ipoteze nu poate finaliza misiunea, EVALUATORUL poate renunța la finalizarea ei, fără ca acest lucru să exonereze Clientul de plata serviciilor prestate până la acel moment.</p>
        <h3>11. Restricții de utilizare, difuzare sau publicare</h3>
        <p>11.1. Utilizarea raportului este permisă doar Clientului și utilizatorilor desemnați explicit, numai pentru scopul declarat. 11.2. Înstrăinarea rapoartelor și/sau citirea lor de către terți după predarea către Client nu atrage răspunderea semnatarilor (evaluatorul autorizat și/sau membrul corporativ) privind interpretarea sau utilizarea datelor din rapoarte. 11.3. Distribuirea și/sau publicarea, prin orice mijloace, inclusiv online, a rapoartelor integral sau parțial, a informațiilor despre EVALUATOR ori a datelor cu caracter personal ale persoanelor fizice asociate rapoartelor este permisă doar cu acordul prealabil scris al evaluatorului autorizat și al EVALUATORULUI. 11.4. Pentru conformitatea cu Standardele de evaluare (SEV), rapoartele pot fi verificate oricând de evaluatori autorizați cu specializarea VE, la cererea Clientului, și/sau de comisiile de specialitate ale ANEVAR; concluziile rezultate din verificarea de către persoane fără calificarea prevăzută de lege, fără acordul scris prealabil al evaluatorului, sunt nule de drept.</p>
        <h3>12. Conformitatea evaluării cu Standardele de evaluare (SEV)</h3>
        <p>12.1. Rapoartele de evaluare se elaborează cu respectarea Standardelor de evaluare ANEVAR în vigoare la data evaluării. 12.2. Pentru emiterea notei de informare asupra valorii de piață nu se aplică prevederile SEV 103 – Raportare.</p>
        <h3>13. Forma raportului</h3>
        <p>13.1. Tipul și forma raportului sunt cele specifice unui raport scris explicativ. 13.2. Conținutul și structura raportului respectă SEV 103 – Raportare: Cap. 1 – Termenii de referință ai evaluării; Cap. 2 – Prezentarea datelor; Cap. 3 – Analiza datelor; Cap. 4 – Aplicarea abordărilor în evaluare; Cap. 5 – Concluzia asupra valorii; Anexele raportului.</p>
        <h3>14. Modificări</h3>
        <p>Dacă pe durata misiunii apar modificări ale termenilor de referință, acestea se consemnează într-un act adițional la Contract.</p>
        <Signatures />
      </article>
        );
      })}

      {/* ---------- Annex 2 ---------- */}
      <article className="cdPage">
        <Head />
        <h1>ANEXA 2 – CONDIȚII FINANCIARE</h1>
        <p className="cdLead">Prevederile prezentelor Condiții financiare se completează cu Condițiile generale și Condițiile speciale, împreună alcătuind Contractul.</p>
        <h2>1. PREȚUL CONTRACTULUI</h2>
        {d.priced ? (
          <>
            <p>1.1. Prețul Serviciilor este următorul:</p>
            <table className="cdTable">
              <thead><tr><th>Nr.</th><th>Serviciu</th><th style={{ textAlign: "right" }}>Preț (lei, fără TVA)</th></tr></thead>
              <tbody>
                {d.annexes.map((x) => <tr key={x.n}><td>{x.n}.</td><td>{x.reportType ?? "Raport de evaluare"}{x.services.movable && !x.services.immovable ? " – bunuri mobile" : x.services.immovable && !x.services.movable ? " – bunuri imobile" : ""}{x.purpose ? ` – ${x.purpose}` : ""} (Anexa 1.{x.n})</td><td style={{ textAlign: "right" }}>{money(x.fee)}</td></tr>)}
                <tr><td /><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>{money(d.total)} lei + TVA</b></td></tr>
              </tbody>
            </table>
          </>
        ) : <p>1.1. Prețul Serviciului este de <b>{money(d.total)} lei + TVA</b>.</p>}
        <p>1.2. Prețul se plătește în contul EVALUATORULUI specificat pe factura fiscală, {pay.payment_when}.</p>
        <h2>2. TERMENUL DE PLATĂ</h2>
        <p>2.1. Termenul de plată al facturilor emise de EVALUATOR este precizat în factura proformă și/sau fiscală, dar nu poate depăși data predării livrabilelor.</p>
        <h2>3. TRANȘE DE PLATĂ</h2>
        <p>3.1. Tranșele de plată agreate de Părți sunt următoarele:</p>
        <ul className="cdPlain">{pay.tranches.split(/\n+/).filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul>
        <p>3.2. EVALUATORUL va emite și comunica facturile astfel încât să asigure Clientului respectarea termenului de plată.</p>
        <Signatures />
      </article>
    </div>
  );
}
