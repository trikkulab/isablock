# Simulazione con 30 studenti (passo 13)

Prova del 8 nov 2026. Script: `test/simulazione/simula-30.mjs` (rapporto grezzo in `test/simulazione/rapporto.json`).

## Come si lancia

```
node scripts/build-rules.mjs test .regole-test.rules
REGOLE_FILE=.regole-test.rules firebase emulators:exec --config <alt.json> --only firestore --project demo-alt \
  "node test/simulazione/simula-30.mjs 30 120"
```

`<alt.json>` = emulatore su porte alternative (firestore 8286, hub 4401), per non toccare quello acceso di `npm run emulators`.
Argomenti: numero di studenti, durata in minuti. Con 30 studenti e 120 minuti simulati servono ~40 secondi reali.

## Cosa fa

- Usa il motore vero (`creaSessione`, `creaVerificaDocente`) contro le regole vere, con un **orologio simulato condiviso**:
  tutti i timer (debounce 25 s, battito 120 s, istantanee 5 min, consegna automatica) corrono in tempo accelerato.
- Il docente crea la verifica con 2 tracce, la apre (fine tra 120 min), tiene aperta la tabella live (`ascoltaSituazione`),
  dà 10 minuti in più a uno studente (min 30), corregge una traccia (min 60) e alla fine chiude con la raccolta.
- Gli studenti entrano nei primi 4 minuti, aggiungono/tolgono istruzioni con ritmi diversi (regolare, lento, veloce, fermo),
  eseguono, 2 incollano di colpo molti blocchi, 2 perdono la rete per ~100 s, 25 consegnano a mano tra il 55% e il 95% del
  tempo, 5 arrivano alla consegna automatica.
- Le scritture e le letture sono contate lato client come le conterebbe Firestore (documenti restituiti o cambiati).

## Risultati (30 studenti, 120 min)

| | Scritture | Letture |
|---|---|---|
| Lavori degli studenti | 2831 | |
| Storia (istantanee) | 320 (316 periodiche + 4 dei 2 salti) | |
| Consegne | 30 | |
| Tabella del docente | | ~2960 |
| Ascolti degli studenti (verifica, traccia, lavoro) | | ~330 |
| **Totale** | **~3180** | **~3290** |

- Tutte le 30 consegne arrivate (25 a mano, 5 automatiche), nessuna scrittura rifiutata dalle regole.
- Per studente: ~106 scritture in 2 ore. Le quote giornaliere Spark (20.000 scritture, 50.000 letture) reggono circa
  6 classi al giorno per le scritture, molte di più per le letture.
- Il conto è sotto la stima di progetto (~4,5k scritture, ~10k letture, `verifica-config.js`): il modello degli studenti
  qui è moderato (programmi di ~40 blocchi, 3,4 KB). Con programmi più grandi le scritture non cambiano, crescono solo i byte.
- Traffico: il docente scarica ~14,5 MB in 2 ore (il listener sui lavori riscarica `programma` a ogni salvataggio);
  gli studenti scrivono ~5,8 MB. Con programmi da 30 KB sarebbero ~10× di più per il docente: va guardato se la scuola ha
  una rete lenta.
- **Soglia del salto (15 blocchi):** ha segnalato solo i 2 studenti che hanno incollato di colpo, nessun falso positivo
  tra gli altri.

## Cosa NON dice

- Il modello di comportamento è inventato: ritmi, dimensioni e incollature vanno confrontati con una verifica vera.
- Non misura rendering di Blockly, latenza di rete reale, Wi-Fi della scuola con 30 portatili insieme.
- Le quote reali di Firebase non si leggono da qui (servono la console «Utilizzo»).
- Il conteggio delle letture è una stima: l'ack di una scrittura propria non è contato, ma pochi casi limite possono
  differire di qualche percento.

## Taratura proposta

Debounce 25 s, battito 120 s e istantanee 5 min restano come sono. `saltoBlocchi` è passato da 15 a 30 dopo la seconda prova (vedi sotto). La vista dal vivo di uno studente (5 s) è implementata (docs/CLOUD.md).

## Seconda prova: vista dal vivo (8 nov 2026)

Studenti a raffiche (5-10 azioni in 3-8 s, poi pausa di 30-150 s; un quarto delle azioni sposta solo un pezzo). Script:
`SIM_MODO=base|osservato|tutti SIM_DEB=<ms> SIM_BURST=1 SIM_ETICHETTA=<nome> node test/simulazione/simula-30.mjs 30 120`.
«osservato» = il docente guarda uno studente alla volta (cambio ogni 2-3 minuti) e solo lui scrive ogni DEB ms; il flag
del docente e la lettura dello studente sono contati (non c'è ancora il meccanismo vero nell'app: è un modello).

| Variante (30 studenti, 2 h) | Scritture | Letture | Traffico docente | Salti segnalati |
|---|---|---|---|---|
| Base, debounce 25 s | 3500 | 3420 | 14,5 MB | 6 |
| Osservato a 5 s | 3800 (+9%) | 3730 | 16,2 MB | 7 |
| Osservato a 2 s | 3920 (+12%) | 3840 | 16,8 MB | 8 |
| Tutti a 5 s | 8840 (2,5×) | 8760 | 40,4 MB | 2 |
| Tutti a 2 s | 11740 (3,4×) | 11660 | 54,4 MB | 2 |

- Tutte le varianti: 30/30 consegne, nessuna scrittura rifiutata.
- La vista dal vivo solo per lo studente osservato costa il 9-12% in più; per tutti, 2,5-3,4 volte.
- Con salvataggi frequenti i salti si spezzano in più salvataggi e la soglia di 15 blocchi non scatta più (6 → 2).
- Con le raffiche la soglia 15 segnala anche studenti che non hanno incollato (6 segnalazioni contro 2 incollature vere):
  da rivedere (alzarla, o contare i blocchi su un intervallo più lungo) prima di fidarsene.
