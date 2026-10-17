// The editable model of the classic contract (Setări → Model contract): three parts in HTML — the general
// conditions, Annex 1 (repeated for every report of the contract) and Annex 2 — with variables written {{key}}.
// Simple variables are text (client name, contract number…); "bloc." variables are pieces built from the data
// (the assets table, the purpose check boxes, the price table, the signatures). No server code here: the editor uses
// the list of variables and the default model too.

export type TemplatePart = "general" | "annex1" | "annex2";
export type ContractTemplate = Record<TemplatePart, string>;
export const PARTS: [TemplatePart, string, string][] = [
  ["general", "Condiții generale", "Prima parte a contractului: părțile și clauzele generale."],
  ["annex1", "Anexa 1 · Condiții speciale", "Se repetă pentru fiecare raport din contract (Anexa 1.1, 1.2…)."],
  ["annex2", "Anexa 2 · Condiții financiare", "Prețul, plata și tranșele."],
];

export type TemplateVar = { key: string; label: string; group: string; sample: string; parts?: TemplatePart[]; block?: boolean };

const ALL: TemplatePart[] = ["general", "annex1", "annex2"];
export const VARIABLES: TemplateVar[] = [
  // Contract
  { key: "contract.numar", label: "Număr contract", group: "Contract", sample: "1448" },
  { key: "contract.data", label: "Data contractului", group: "Contract", sample: "17.10.2026" },
  { key: "contract.pret_total", label: "Preț total (fără TVA)", group: "Contract", sample: "1.200" },
  { key: "contract.plata_cand", label: "Când se plătește", group: "Contract", sample: "înainte de predarea raportului" },
  { key: "contract.tiparire", label: "Tipărire și curierat (text)", group: "Contract", sample: "" },
  { key: "contract.anexe_mentiune", label: "Mențiune anexe 1.x (dacă sunt mai multe rapoarte)", group: "Contract", sample: ", câte o anexă pentru fiecare raport contractat: 1.1–1.2" },
  { key: "contract.anexe_oricare", label: "Mențiune „oricare dintre anexele 1.x”", group: "Contract", sample: " (oricare dintre anexele 1.x)" },
  // Firm
  { key: "firma.nume", label: "Denumire", group: "Firma (VALUEFY)", sample: "VALUEFY SRL" },
  { key: "firma.adresa", label: "Sediul social", group: "Firma (VALUEFY)", sample: "Cluj-Napoca, str. Exemplu 1" },
  { key: "firma.adresa_corespondenta", label: "Adresa de corespondență", group: "Firma (VALUEFY)", sample: "Cluj-Napoca, str. Exemplu 1" },
  { key: "firma.cui", label: "CUI", group: "Firma (VALUEFY)", sample: "RO12345678" },
  { key: "firma.reg_com", label: "Nr. înmatriculare", group: "Firma (VALUEFY)", sample: "J12/1234/2020" },
  { key: "firma.iban", label: "IBAN", group: "Firma (VALUEFY)", sample: "RO11INGB…" },
  { key: "firma.reprezentant", label: "Reprezentant", group: "Firma (VALUEFY)", sample: "Ion Popescu" },
  { key: "firma.calitate", label: "Calitatea reprezentantului", group: "Firma (VALUEFY)", sample: "Administrator" },
  { key: "firma.telefon", label: "Telefon", group: "Firma (VALUEFY)", sample: "0700 000 000" },
  { key: "firma.email", label: "Email", group: "Firma (VALUEFY)", sample: "office@valuefy.ro" },
  { key: "firma.autorizatie", label: "Autorizație ANEVAR", group: "Firma (VALUEFY)", sample: "0123" },
  { key: "firma.instanta", label: "Instanța competentă", group: "Firma (VALUEFY)", sample: "Cluj-Napoca" },
  // Client
  { key: "client.nume", label: "Nume (cu majuscule)", group: "Client", sample: "POPESCU IOANA" },
  { key: "client.tip", label: "Persoană fizică / juridică", group: "Client", sample: "Persoană fizică" },
  { key: "client.adresa", label: "Adresa de facturare", group: "Client", sample: "Timișoara, str. Bujorilor 4" },
  { key: "client.cui", label: "CUI / CNP", group: "Client", sample: "—" },
  { key: "client.reg_com", label: "Nr. înregistrare", group: "Client", sample: "—" },
  { key: "client.reprezentant", label: "Reprezentant", group: "Client", sample: "—" },
  { key: "client.telefon", label: "Telefon", group: "Client", sample: "0722 000 000" },
  { key: "client.email", label: "Email", group: "Client", sample: "client@exemplu.ro" },
  // Annex 1 (one per report)
  { key: "anexa.numar", label: "Numărul anexei (1 sau 1.2)", group: "Anexa 1 · raportul", sample: "1", parts: ["annex1"] },
  { key: "anexa.raport_din", label: "„Raportul 1 din 2 · scop” (doar la mai multe rapoarte)", group: "Anexa 1 · raportul", sample: "", parts: ["annex1"] },
  { key: "anexa.numar_raport", label: "Numărul raportului", group: "Anexa 1 · raportul", sample: "2692", parts: ["annex1"] },
  { key: "anexa.scop", label: "Scopul evaluării", group: "Anexa 1 · raportul", sample: "Garantare bancară", parts: ["annex1"] },
  { key: "anexa.termen", label: "Termen de livrare (zile lucrătoare)", group: "Anexa 1 · raportul", sample: "3 zile lucrătoare", parts: ["annex1"] },
  { key: "anexa.nr_rapoarte", label: "Număr de rapoarte livrate", group: "Anexa 1 · raportul", sample: "1", parts: ["annex1"] },
  { key: "anexa.utilizatori", label: "Utilizatori desemnați", group: "Anexa 1 · raportul", sample: "POPESCU IOANA, BRD", parts: ["annex1"] },
  { key: "anexa.alte_persoane", label: "Alte persoane cu acces", group: "Anexa 1 · raportul", sample: "Nu este cazul", parts: ["annex1"] },
  { key: "anexa.tip_valoare", label: "Tipul valorii", group: "Anexa 1 · raportul", sample: "Valoare de piață", parts: ["annex1"] },
  { key: "anexa.definitie_valoare", label: "Definiția tipului valorii", group: "Anexa 1 · raportul", sample: "Suma estimată…", parts: ["annex1"] },
  { key: "anexa.data_referinta", label: "Data de referință (data inspecției…)", group: "Anexa 1 · raportul", sample: "data inspecției", parts: ["annex1"] },
  { key: "anexa.limitari", label: "Limitări ale documentării", group: "Anexa 1 · raportul", sample: "…", parts: ["annex1"] },
  { key: "anexa.surse", label: "Informații furnizate de client", group: "Anexa 1 · raportul", sample: "extras CF, releveu…", parts: ["annex1"] },
  { key: "anexa.ipoteze_speciale", label: "Ipoteze speciale", group: "Anexa 1 · raportul", sample: "Nu este cazul.", parts: ["annex1"] },
  // Blocks
  { key: "bloc.parti", label: "Părțile contractului (două coloane)", group: "Blocuri", sample: "", parts: ["general"], block: true },
  { key: "bloc.contacte", label: "Datele de contact ale părților", group: "Blocuri", sample: "", parts: ["general"], block: true },
  { key: "bloc.semnaturi", label: "Semnăturile (evaluator și client)", group: "Blocuri", sample: "", parts: ALL, block: true },
  { key: "bloc.servicii", label: "Bife: serviciul contractat", group: "Blocuri", sample: "", parts: ["annex1"], block: true },
  { key: "bloc.livrabile", label: "Bife: livrabile (raport, NOP, NIP)", group: "Blocuri", sample: "", parts: ["annex1"], block: true },
  { key: "bloc.tabel_bunuri", label: "Tabel: bunurile evaluate", group: "Blocuri", sample: "", parts: ["annex1"], block: true },
  { key: "bloc.tip_client", label: "Bife: persoană fizică / juridică + nume", group: "Blocuri", sample: "", parts: ["annex1"], block: true },
  { key: "bloc.scopuri", label: "Bife: scopul evaluării", group: "Blocuri", sample: "", parts: ["annex1"], block: true },
  { key: "bloc.tipuri_valoare", label: "Bife: tipul valorii + definiția", group: "Blocuri", sample: "", parts: ["annex1"], block: true },
  { key: "bloc.inspectie_comuna", label: "Paragraf „inspecție comună” (doar dacă e cazul)", group: "Blocuri", sample: "", parts: ["annex1"], block: true },
  { key: "bloc.pret", label: "Prețul: tabel pe rapoarte sau o frază", group: "Blocuri", sample: "", parts: ["annex2"], block: true },
  { key: "bloc.transe", label: "Lista tranșelor de plată", group: "Blocuri", sample: "", parts: ["annex2"], block: true },
];
export const VAR_KEYS = new Set(VARIABLES.map((v) => v.key));
export const varLabel = (key: string) => {
  const v = VARIABLES.find((x) => x.key === key);
  return v ? `${v.group.split(" ·")[0].replace(" (VALUEFY)", "")}: ${v.label}` : key;
};

const v = (k: string) => `{{${k}}}`;

export const DEFAULT_TEMPLATE: ContractTemplate = {
  general: `<h1>CONTRACT DE PRESTĂRI SERVICII</h1>
<p class="cdLead">Prezentul contract de prestări servicii are numărul <b>${v("contract.numar")}</b> și a fost încheiat în data de <b>${v("contract.data")}</b>, între:</p>
<p>${v("bloc.parti")}</p>
<h2>1. DEFINIȚII</h2>
<p>Entitățile definite mai sus vor fi denumite în mod individual „Partea” și în mod colectiv „Părțile”. În vederea aplicării prezentului Contract și a documentelor care îl completează sau îl însoțesc, definițiile utilizate vor avea următorul înțeles:</p>
<ul class="cdDefs">
<li><b>„raport de evaluare”</b> – un raport care comunică destinatarului / utilizatorului desemnat o concluzie asupra valorii și elementele relevante asociate acesteia (Standardele de evaluare a bunurilor – Glosar 2025). Acesta intră în categoria livrabilelor;</li>
<li><b>„date și/sau informații”</b> – totalitatea datelor și informațiilor comunicate între Părți, inclusiv date cu caracter personal, astfel cum rezultă din documente sau alte surse, rapoarte, corespondență scrisă;</li>
<li><b>„date cu caracter personal”</b> – orice informații privind o persoană fizică identificată sau identificabilă, în sensul Regulamentului (UE) 2016/679 („GDPR”), furnizate de Părți sau colectate în executarea Contractului. Acestea se referă, fără a se limita la: nume, prenume, adresa de domiciliu / reședință, adresa de corespondență electronică, număr de telefon, CNP, datele actului de identitate, identificatorul contului bancar, datele din cartea funciară, adresa / localizarea bunurilor aflate în proprietatea Clientului și care vor fi supuse evaluării, precum și fotografiile realizate la inspecție.</li>
</ul>
<h2>2. CONTRACTUL ȘI OBIECTUL CONTRACTULUI</h2>
<p>2.1. Termenii și condițiile prestării serviciilor sunt reglementate prin Condițiile generale, Condițiile speciale (Anexa 1${v("contract.anexe_mentiune")}), Condițiile financiare (Anexa 2) și celelalte anexe, denumite în continuare, împreună, „Contractul”.</p>
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
<p>8.6. <b>Drepturile persoanelor vizate.</b> Persoanele vizate au dreptul de acces, de rectificare, de ștergere, de restricționare a prelucrării, de portabilitate și de opoziție, în condițiile GDPR, precum și dreptul de a depune plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (www.dataprotection.ro). Cererile se adresează EVALUATORULUI la ${v("firma.email")} sau la adresa de corespondență din capitolul 11.</p>
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
<p>${v("bloc.contacte")}</p>
<h2>12. FORȚA MAJORĂ</h2>
<p>12.1. Forța majoră este o circumstanță sau un eveniment excepțional care este mai presus de controlul Părții, de care aceasta nu s-a putut apăra în mod rezonabil înainte de încheierea Contractului, pe care, după ce s-a ivit, nu l-a putut evita sau depăși în mod rezonabil și care nu este în mod substanțial atribuibil celeilalte Părți.</p>
<p>12.2. Pe durata forței majore, Părțile nu își datorează penalități, daune sau compensații, cu excepția cazului în care circumstanțele au fost determinate de Partea căreia i se pretind. Partea afectată va notifica imediat cealaltă Parte; la cerere, va dovedi forța majoră în 15 zile calendaristice, printr-un certificat emis de Camera de Comerț și Industrie a României. Dacă forța majoră durează mai mult de 30 de zile calendaristice, oricare Parte poate rezilia Contractul printr-o notificare cu efect imediat.</p>
<h2>13. INTERDICȚIA CESIONĂRII. SUBCONTRACTARE</h2>
<p>13.1. Fără acordul scris al celeilalte Părți, nicio Parte nu va cesiona sau subcontracta Contractul, parțial sau integral, unor terți.</p>
<h2>14. DECLARAȚII ȘI GARANȚII</h2>
<p>14.1. Fiecare Parte declară și garantează că: Contractul reprezintă o obligație valabilă și angajantă; nu se află în stare de necesitate, în sensul art. 1218 din Codul civil; încheierea și executarea Contractului nu încalcă prevederi legale sau acte administrative și nu necesită aprobarea unor terți; semnatarii sunt pe deplin împuterniciți să semneze Contractul; își asumă îndeplinirea integrală a obligațiilor ce rezultă din Contract.</p>
<p>14.2. CLIENTUL declară că nu se află în stare de insolvabilitate sau incapacitate de plată; declarațiile necorespunzătoare realității atrag răspunderea în condițiile legii.</p>
<h2>15. CLAUZA PENALĂ</h2>
<p>15.1. Orice utilizare, distribuire, reproducere sau publicare în afara condițiilor din Anexa 1${v("contract.anexe_oricare")}, pct. B.11 „Restricții de utilizare, difuzare sau publicare”, atrage răspunderea directă a CLIENTULUI, iar EVALUATORUL este îndreptățit la daune-interese egale cu prețul Contractului, pentru fiecare situație în parte, cu titlu de daune compensatorii conform art. 1538 din Codul civil.</p>
<h2>16. LEGISLAȚIA APLICABILĂ</h2>
<p>16.1. Contractul, inclusiv încheierea, valabilitatea și executarea sa, este guvernat de legislația română.</p>
<h2>17. JURISDICȚIE</h2>
<p>17.1. Orice dispută privind încheierea, interpretarea, executarea, modificarea sau încetarea Contractului se soluționează pe cale amiabilă, prin conciliere directă sau mediere. Dacă disputa nu se soluționează amiabil într-un termen de cel puțin 30 de zile calendaristice, Partea interesată se poate adresa instanțelor judecătorești competente din ${v("firma.instanta")}.</p>
<h2>18. NULITATEA UNOR PREVEDERI</h2>
<p>18.1. Dacă o instanță competentă constată că o prevedere a Contractului este nelegală, nevalabilă sau neexecutorie, celelalte prevederi rămân valabile, iar Părțile vor conveni asupra unei prevederi alternative, valabile și executorii, cu efect cât mai apropiat. Renunțarea unei Părți la termeni sau prevederi ale Contractului produce efecte doar dacă este făcută în scris și semnată de acea Parte.</p>
<h2>19. INTEGRALITATEA CONTRACTULUI</h2>
<p>19.1. Contractul, împreună cu anexele sale, reprezintă întregul acord al Părților, înlocuiește orice înțelegeri anterioare cu același obiect și se poate modifica doar în scris, cu semnătura Părților. Contractul a fost încheiat astăzi, ${v("contract.data")}, în 2 (două) exemplare originale, câte unul pentru fiecare Parte, sau în format electronic, semnat cu semnătură electronică.</p>
<p>${v("bloc.semnaturi")}</p>`,

  annex1: `<h1>ANEXA ${v("anexa.numar")} – CONDIȚII SPECIALE</h1>
<p class="cdLead">${v("anexa.raport_din")}</p>
<p class="cdLead">Prevederile prezentelor Condiții speciale se completează cu Condițiile generale și Condițiile financiare, împreună alcătuind Contractul.</p>
<h2>A. SERVICIILE</h2>
<h3>1. Serviciul contractat</h3>
<p>La cererea Clientului au fost contractate următoarele servicii:</p>
<p>${v("bloc.servicii")}</p>
<h3>2. Livrabile. Condiții de livrare</h3>
<p>2.1. În urma prestării Serviciului, livrabilele sunt următoarele:</p>
<p>${v("bloc.livrabile")}</p>
<p>2.2. Livrabilul va fi semnat cu semnătura electronică a EVALUATORULUI și va fi considerat exemplar original.</p>
<p>2.3. Livrarea se face prin poștă electronică.</p>
<p>2.4. Termenul de livrare este de <b>${v("anexa.termen")}</b> de la data realizării inspecției fizice a proprietății și a primirii tuturor informațiilor.</p>
<p>2.5. La solicitarea scrisă a Clientului, livrabilele pot fi tipărite și livrate prin curier${v("contract.tiparire")}. Costurile de tipărire și curierat sunt suportate de Client, suplimentar față de prețul din Anexa 2, și se evidențiază în factura emisă de EVALUATOR.</p>
<h2>B. TERMENII DE REFERINȚĂ AI EVALUĂRII</h2>
<h3>1. Identificarea obiectului evaluării</h3>
<p>${v("bloc.tabel_bunuri")}</p>
<h3>2. Identificarea și competența evaluatorului</h3>
<p>2.1. ${v("firma.nume")} (EVALUATORUL) este membru corporativ ANEVAR, înscris în Tabloul membrilor corporativi cu nr. de autorizație ${v("firma.autorizatie")}, calitate dobândită în condițiile OG nr. 24/2011 privind unele măsuri în domeniul evaluării bunurilor, și are dreptul de a contracta și presta servicii de evaluare a bunurilor.</p>
<p>2.2. Nici EVALUATORUL, nici evaluatorii semnatari ai raportului nu au vreo legătură sau vreun interes special cu privire la obiectul evaluării sau la Client.</p>
<p>2.3. Rezultatele prezentate în raport nu se bazează pe solicitarea obținerii unei anumite valori, venită din partea Clientului sau a altor persoane interesate, iar remunerarea evaluării nu depinde de satisfacerea unei asemenea solicitări.</p>
<p>2.4. EVALUATORUL, împreună cu evaluatorii autorizați semnatari, își asumă responsabilitatea pentru rezultatele și concluziile raportului, opinia asupra valorii fiind obiectivă și imparțială.</p>
<h3>3. Identificarea clientului și a utilizatorilor</h3>
<p>${v("bloc.tip_client")}</p>
<p>3.1. Utilizatori desemnați: <b>${v("anexa.utilizatori")}</b></p>
<p>3.2. Alte persoane (fizice sau juridice) care au acces la raportul de evaluare: ${v("anexa.alte_persoane")}</p>
<p>3.3. Accesul altor persoane la raport, în afara Clientului și a utilizatorilor desemnați, exclude orice răspundere a evaluatorului față de acestea: persoana care primește o copie a raportului nu devine utilizator desemnat decât dacă este autorizată de evaluator și identificată explicit ca atare și nu este îndreptățită la nicio pretenție față de evaluator sau față de EVALUATOR.</p>
<p>3.4. Forma și conținutul raportului țin seama de persoanele pentru care se realizează evaluarea, pentru ca acesta să conțină informații adecvate necesităților lor.</p>
<h3>4. Scopul evaluării</h3>
<p>4.1. Evaluarea este cerută de Client pentru:</p>
<p>${v("bloc.scopuri")}</p>
<p>4.2. Evaluarea nu poate fi utilizată în afara contextului sau în alte scopuri decât cel selectat la pct. 4.1.</p>
<h3>5. Tipul valorii</h3>
<p>5.1. În acord cu scopul evaluării, valoarea estimată pentru bunurile identificate la pct. B.1 va fi:</p>
<p>${v("bloc.tipuri_valoare")}</p>
<h3>6. Drepturi de proprietate</h3>
<p>6.1. Se supune evaluării dreptul de proprietate asupra bunurilor identificate la pct. B.1.</p>
<h3>7. Data evaluării</h3>
<p>7.1. Valorile estimate vor fi emise în condițiile pieței specifice de la data evaluării. 7.2. Data evaluării / data de referință este ${v("anexa.data_referinta")}.</p>
<h3>8. Documentarea pentru elaborarea evaluării</h3>
<p>8.1. Evaluarea include toate cercetările, informațiile, raționamentele, analizele și concluziile necesare pentru a ajunge la valoarea estimată. 8.2. ${v("anexa.limitari")}</p>
<p>${v("bloc.inspectie_comuna")}</p>
<h3>9. Natura și sursa informațiilor pe care se va baza evaluarea</h3>
<p>9.1. Evaluatorul va utiliza informații specifice tipului de bun și scopului evaluării, după cum urmează: 9.1.1. furnizate de Client: ${v("anexa.surse")}; 9.1.2. din surse de piață: analize, studii, informații și statistici din mediul online, din publicații de specialitate sau furnizate de terți.</p>
<h3>10. Ipoteze și ipoteze speciale</h3>
<p>10.1. <b>Ipoteze</b> – aspecte acceptate în mod rezonabil ca fapte în contextul evaluării, fără a fi documentate sau verificate în mod specific: 10.1.1. valoarea se estimează în ipoteza că nu există costuri legate de responsabilitățile de mediu sau de conformarea la cerințele legale; evaluatorul nu răspunde pentru contaminări sau efecte asupra mediului pe care nu le-a putut identifica în mod rezonabil și despre care Clientul nu l-a informat; 10.1.2. evaluatorul nu efectuează expertize tehnice de detaliu și nu inspectează părțile inaccesibile sau acoperite, care se consideră în stare tehnică bună, fără a se valida integritatea acestora; 10.1.3. dimensiunile și detaliile din raport se consideră corecte și se bazează pe informațiile furnizate de Client și/sau producător; 10.1.4. Clientul răspunde pentru legalitatea, veridicitatea și acuratețea informațiilor furnizate; EVALUATORUL nu are calitatea și competența de a verifica aceste aspecte; 10.1.5. EVALUATORUL efectuează proceduri limitate pentru a determina rezonabilitatea și consistența informațiilor primite; 10.1.6. Contractul nu include modificarea sau actualizarea evaluării pe baza informațiilor sau evenimentelor apărute după livrarea raportului.</p>
<p>10.2. <b>Ipoteze speciale</b> – ipoteze care presupun date diferite de cele reale de la data evaluării sau pe care un participant tipic de pe piață nu le-ar presupune: ${v("anexa.ipoteze_speciale")}</p>
<p>10.3. Evaluatorul poate completa ipotezele de mai sus pe parcursul misiunii, doar după înștiințarea Clientului și obținerea acordului scris al acestuia. Dacă Clientul nu este de acord, iar evaluatorul consideră că fără aceste ipoteze nu poate finaliza misiunea, EVALUATORUL poate renunța la finalizarea ei, fără ca acest lucru să exonereze Clientul de plata serviciilor prestate până la acel moment.</p>
<h3>11. Restricții de utilizare, difuzare sau publicare</h3>
<p>11.1. Utilizarea raportului este permisă doar Clientului și utilizatorilor desemnați explicit, numai pentru scopul declarat. 11.2. Înstrăinarea rapoartelor și/sau citirea lor de către terți după predarea către Client nu atrage răspunderea semnatarilor (evaluatorul autorizat și/sau membrul corporativ) privind interpretarea sau utilizarea datelor din rapoarte. 11.3. Distribuirea și/sau publicarea, prin orice mijloace, inclusiv online, a rapoartelor integral sau parțial, a informațiilor despre EVALUATOR ori a datelor cu caracter personal ale persoanelor fizice asociate rapoartelor este permisă doar cu acordul prealabil scris al evaluatorului autorizat și al EVALUATORULUI. 11.4. Pentru conformitatea cu Standardele de evaluare (SEV), rapoartele pot fi verificate oricând de evaluatori autorizați cu specializarea VE, la cererea Clientului, și/sau de comisiile de specialitate ale ANEVAR; concluziile rezultate din verificarea de către persoane fără calificarea prevăzută de lege, fără acordul scris prealabil al evaluatorului, sunt nule de drept.</p>
<h3>12. Conformitatea evaluării cu Standardele de evaluare (SEV)</h3>
<p>12.1. Rapoartele de evaluare se elaborează cu respectarea Standardelor de evaluare ANEVAR în vigoare la data evaluării. 12.2. Pentru emiterea notei de informare asupra valorii de piață nu se aplică prevederile SEV 103 – Raportare.</p>
<h3>13. Forma raportului</h3>
<p>13.1. Tipul și forma raportului sunt cele specifice unui raport scris explicativ. 13.2. Conținutul și structura raportului respectă SEV 103 – Raportare: Cap. 1 – Termenii de referință ai evaluării; Cap. 2 – Prezentarea datelor; Cap. 3 – Analiza datelor; Cap. 4 – Aplicarea abordărilor în evaluare; Cap. 5 – Concluzia asupra valorii; Anexele raportului.</p>
<h3>14. Modificări</h3>
<p>Dacă pe durata misiunii apar modificări ale termenilor de referință, acestea se consemnează într-un act adițional la Contract.</p>
<p>${v("bloc.semnaturi")}</p>`,

  annex2: `<h1>ANEXA 2 – CONDIȚII FINANCIARE</h1>
<p class="cdLead">Prevederile prezentelor Condiții financiare se completează cu Condițiile generale și Condițiile speciale, împreună alcătuind Contractul.</p>
<h2>1. PREȚUL CONTRACTULUI</h2>
<p>${v("bloc.pret")}</p>
<p>1.2. Prețul se plătește în contul EVALUATORULUI specificat pe factura fiscală, ${v("contract.plata_cand")}.</p>
<h2>2. TERMENUL DE PLATĂ</h2>
<p>2.1. Termenul de plată al facturilor emise de EVALUATOR este precizat în factura proformă și/sau fiscală, dar nu poate depăși data predării livrabilelor.</p>
<h2>3. TRANȘE DE PLATĂ</h2>
<p>3.1. Tranșele de plată agreate de Părți sunt următoarele:</p>
<p>${v("bloc.transe")}</p>
<p>3.2. EVALUATORUL va emite și comunica facturile astfel încât să asigure Clientului respectarea termenului de plată.</p>
<p>${v("bloc.semnaturi")}</p>`,
};

const ALLOWED = new Set(["p", "h1", "h2", "h3", "h4", "b", "strong", "i", "em", "u", "s", "br", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "span", "div", "blockquote", "hr", "sup", "sub", "small"]);
const STYLE_OK = /^(text-align|font-weight|font-style|text-decoration|margin-left|padding-left|width|font-size)\s*:\s*[-#\w\s.%,()]+$/i;

/**
 * Keeps only plain document markup: known tags, alignment / emphasis styles, table spans and a few classes; no
 * scripts, links, images, event handlers or foreign styles. Run on save and again before rendering.
 */
export function sanitizeTemplate(html: string) {
  return String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math|template|noscript|textarea|select|button|form|input|link|meta|base)\b[\s\S]*?(<\/\1\s*>|$)/gi, "")
    .replace(/<\/?([a-zA-Z][\w-]*)([^>]*)>/g, (m, tag: string, attrs: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED.has(t)) return "";
      if (m.startsWith("</")) return `</${t}>`;
      const keep: string[] = [];
      for (const a of attrs.matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        const name = a[1].toLowerCase(), val = (a[3] ?? a[4] ?? a[5] ?? "").replace(/"/g, "&quot;");
        if (name === "style") {
          const ok = val.split(";").map((x) => x.trim()).filter((x) => x && STYLE_OK.test(x) && !/url|expression/i.test(x));
          if (ok.length) keep.push(`style="${ok.join("; ")}"`);
        } else if ((name === "colspan" || name === "rowspan") && /^\d{1,2}$/.test(val)) keep.push(`${name}="${val}"`);
        else if (name === "class" && /^[\w\s-]{1,60}$/.test(val)) keep.push(`class="${val}"`);
      }
      const self = /\/\s*$/.test(attrs) || t === "br" || t === "hr";
      return `<${t}${keep.length ? ` ${keep.join(" ")}` : ""}${self && (t === "br" || t === "hr") ? "" : ""}>`;
    });
}

/**
 * Puts the values in: a block variable alone in a paragraph replaces the whole paragraph (blocks are lists, tables
 * or two-column boxes); other variables are replaced in place. Unknown variables are left visible as [[key]].
 */
export function fillTemplate(html: string, values: Record<string, string>) {
  return sanitizeTemplate(html)
    .replace(/<(p|div)(\s[^>]*)?>\s*\{\{\s*(bloc\.[\w.]+)\s*\}\}\s*<\/\1>/g, (_, _t, _a, key: string) => values[key] ?? "")
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => (key in values ? values[key] : `[[${key}]]`));
}

export const cleanTemplate = (raw: unknown): ContractTemplate => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (k: TemplatePart) => (typeof o[k] === "string" && (o[k] as string).trim() ? sanitizeTemplate((o[k] as string).slice(0, 400000)) : DEFAULT_TEMPLATE[k]);
  return { general: pick("general"), annex1: pick("annex1"), annex2: pick("annex2") };
};
