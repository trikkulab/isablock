# Roadmap

## Fase 1 — Editor a blocchi con tre output sincronizzati

Obiettivo: uno strumento usabile in classe che copre tutti i costrutti elencati in
`SPEC.md`, con pseudocodice/C/Python generati in tempo reale dallo stesso algoritmo.

Criterio di "fatto": un docente può comporre a blocchi ciascuno dei cinque algoritmi
di esempio citati in `SPEC.md` (massimo/minimo, somma di una sequenza, ricerca
lineare, fattoriale, verifica di primalità elementare) e ottenere pseudocodice, C e
Python corretti e coerenti tra loro per ognuno.

Include anche, come requisiti minimi di usabilità in laboratorio:
- salvataggio/caricamento locale del lavoro (vedi SPEC.md, sezione Persistenza)
- almeno un esempio precaricato, per far vedere subito lo strumento in azione senza
  che lo studente debba costruire tutto da zero alla prima esperienza

## Fase 2 — Vista a diagramma di flusso sincronizzata

Un secondo modo di rappresentare **lo stesso identico programma** della Fase 1, a
diagramma di flusso invece che a blocchi. Le due viste sono intercambiabili: modifico
in una, l'altra si aggiorna.

Vincolo architetturale chiave (vedi anche SPEC.md): il flowchart deve essere
strutturato fin dall'inizio, non un canvas libero. Ogni forma (decisione, ciclo) ha un
solo ingresso e una sola uscita; si inseriscono nuovi elementi solo spezzando una
connessione esistente, mai disegnando frecce arbitrarie. Senza questo vincolo, il
flowchart potrebbe rappresentare strutture non traducibili in blocchi annidati puliti.

Prerequisito tecnico: un modello dati intermedio che descriva il programma in modo
astratto, indipendente da quale vista lo sta visualizzando o modificando. Sia i
blocchi che il flowchart leggono/scrivono questo stesso modello; i generatori di
codice della Fase 1 continuano a leggere dal modello, non da una vista specifica.

Non iniziare questa fase finché la Fase 1 non è stata usata e validata in classe
almeno una volta: è la fase tecnicamente più delicata (sincronizzazione bidirezionale
mantenendo sempre una struttura valida), meglio partire da un cuore (modello +
generatori) già stabile.

## Fase 3 — Estensioni sul dominio, da validare con l'uso reale

Non impegnative singolarmente, ma da introdurre solo se l'uso in classe ne conferma
il bisogno reale:

- Tipi di dato oltre agli interi (stringhe, numeri decimali) — come blocchi distinti,
  vedi nota in SPEC.md
- Funzioni/procedure definite dallo studente
- Esecuzione reale del codice generato (Python è il candidato più semplice da
  eseguire direttamente nel browser; C richiede un compilatore, quindi più complesso)
- Libreria di esempi precaricati più ampia, per costruire una piccola progressione
  didattica dentro lo strumento stesso
- Eventuale salvataggio collegato a un account/classe (richiederebbe introdurre un
  backend, oggi volutamente assente — va proposto e discusso esplicitamente, non
  aggiunto di default)
