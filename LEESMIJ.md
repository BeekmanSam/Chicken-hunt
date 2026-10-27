# Duck Hunt Dublin — versie 3 (live multiplayer)

**Voor zaterdag 7 november 2026.** De gezamenlijke start is handmatig: druk rond 17:00 op **START**, waarna op alle iPhones dezelfde twee-uurstimer loopt. De eenden hebben de eerste tien minuten voorsprong.

## Wat is er veranderd?

- **Rollen kiezen:** bij de eerste keer openen kies je Duck of Hunter. De rol staat alleen op je eigen telefoon. Tik bovenin op je rol om hem later aan te passen.
- **Gezamenlijke START:** één persoon drukt op START, op de andere telefoons start het spel bij de volgende synchronisatie (normaal binnen ongeveer 2,5 seconden).
- **Gezamenlijke RESET:** iedereen kan ook tijdens het spel resetten. Er wordt eerst om bevestiging gevraagd. Vervolgens zien alle spelers de wachtkamer. Iedereen kan weer op START klikken.
- **Echt willekeurige zones:** de server genereert bij elke nieuwe start een nieuw willekeurig seed. Dezelfde seed zorgt ervoor dat iedereen dezelfde zones ziet. Elke zone blijft binnen de vorige, de eerste krimp is beperkt en de laatste twee zones liggen dichter bij elkaar. De eindzone is maximaal 150 m in straal en ligt bij meerdere pubs.
- **Blijvende fotomeldingen:** Ducks krijgen na 30 en 70 minuten een foto-opdracht in beeld. De melding blijft totdat zij op 'Begrepen' klikken, ook na opnieuw openen van de pagina. Het versturen van de foto gaat handmatig via WhatsApp.
- **Verbeterde mobiele interface:** timer, huidige zone, START, RESET en DEEL zijn altijd beschikbaar. Tik op 'Alle spelinfo' om dezelfde details als op de laptop te zien; tik nogmaals om terug naar de kaart te gaan.
- **Pubs en GPS:** de bestaande lijst met 49 pub- en barlocaties plus aanvulling uit OpenStreetMap blijft aanwezig. GPS is alleen lokaal zichtbaar en wordt niet naar de server verstuurd.

## BELANGRIJK: nieuwe manier van publiceren

Deze nieuwe versie werkt **NIET** als je alleen `index.html` vervangt op je oude `pages.dev`-website. Dat werkte voor de oude spelklok, maar live synchroniseren tussen verschillende telefoons vereist een klein serveronderdeel. Dit ZIP-bestand bevat dat serveronderdeel al. Cloudflare's gratis Workers-abonnement en SQLite Durable Objects kunnen daarvoor worden gebruikt binnen de gratis gebruikslimieten.

### Eenmalig publiceren vanaf je Windows-laptop

1. Pak het ZIP-bestand uit, zodat de map `duck_hunt_dublin_v3` de bestanden `wrangler.jsonc`, `package.json` en de mappen `public` en `src` bevat.
2. Installeer [Node.js LTS](https://nodejs.org/en/download) als dat nog niet op je laptop staat.
3. Open deze uitgepakte map in Verkenner. Klik in de adresbalk, typ `powershell` en druk op Enter.
4. Voer na elkaar de volgende opdrachten uit:

   ```powershell
   npm install
   npx wrangler login
   npx wrangler deploy
   ```

5. Er opent een browser om je bestaande **Cloudflare-account** te koppelen. Rond deze autorisatie af. Bij het deployen geeft Cloudflare een nieuwe openbare link, doorgaans `https://duck-hunt-dublin-live.<jouw-subdomein>.workers.dev`.
6. Open **de nieuwe `workers.dev`-link** (dus niet de oude `pages.dev`-link), selecteer een rol en klik op **DEEL**. Stuur de **volledige** link met `?room=...` naar de andere drie spelers.

**De andere drie spelers hoeven niets te installeren en geen accounts aan te maken.** Zij openen de spellink gewoon in Safari op hun iPhone.

### Spelen

1. Iedere speler opent dezelfde spellink op zijn iPhone en kiest Duck of Hunter.
2. Als iedereen de lobby ziet en 'LIVE VERBONDEN' staat, kan een willekeurige speler op **START** drukken.
3. De eenden vertrekken direct. De jagers wachten tien minuten.
4. Iedere twintig minuten wordt een nieuwe zone actief; vijf minuten vooraf wordt die op de kaart aangekondigd.
5. Wie Duck heeft gekozen ontvangt twee fotomeldingen die blijven staan totdat ze zijn gesloten. De twee eenden delen de foto zelf via WhatsApp.
6. Als iemand op **RESET** drukt en bevestigt, gaat iedereen terug naar de wachtkamer; de volgende start maakt **een volledig nieuwe willekeurige reeks**.
7. Na twee uur blijft de resetknop bruikbaar voor een volgend spel.

### Testen zonder twee uur te spelen

Open op twee telefoons dezelfde link. Kies verschillende rollen. Start op telefoon A en controleer dat B binnen enkele seconden begint. Reset vervolgens op B en controleer dat A ook stopt. Start opnieuw en vergelijk de vormen van de zones: de indeling verandert per spel. Voor de foto-opdracht kun je wachten tot minuut 30 of lokaal een test uitvoeren met de broncode; er is geen aparte versneld-vooruitknop ingebouwd.

### Problemen

- **'OFFLINE' of geen synchronisatie?** Je gebruikt mogelijk nog de oude `pages.dev`-website, of de Worker is nog niet goed gedeployed. Controleer of je een `workers.dev`-link hebt en of Cloudflare meldt dat de deployment geslaagd is.
- **Ander speelveld op twee iPhones?** Controleer dat **beide dezelfde volledige spellink, inclusief de `room`-code**, gebruiken en allebei verbonden zijn.
- **Geen GPS?** Open de site via HTTPS in Safari, tik op het locatie-icoon en geef locatietoegang. Locatie-updates kunnen tijdelijk stoppen als iOS Safari op de achtergrond staat.
- **Geen geluid?** Open de volledige spelinfo en tik op 'Geluid aanzetten'. iPhones laten geen willekeurig geluid zonder gebruikersactie of in de achtergrond toe.
- **Pubs ontbreken?** De kaart toont 49 ingebouwde locaties en probeert actuele OSM-data op te halen. Niet iedere pub op Google Maps staat noodzakelijk in OpenStreetMap, en sommige ingebouwde kaartpinnen zijn bij benadering.

**Technische gegevens:** 1 Cloudflare Worker met statische HTML-kaart, 1 SQLite-backed Durable Object per unieke game room. De spelertelefoons vragen de gedeelde sessie om de 2,5 seconden op. Opgeslagen in de gedeelde sessie: alleen status, versienummer, starttijd en willekeurige seed. Geen rollen, GPS, foto's of namen. Roomleden kunnen allemaal starten en resetten.
