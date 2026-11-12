#!/usr/bin/env python3
"""Spezza il JSON delle consegne (esportato da IsaBlock con «Esporta JSON di tutti») in file separati.

Uso:   python3 scripts/consegne_json_a_file.py <consegne.json> <cartella-di-uscita>

Scrive, nella cartella (creata se manca):
  - traccia-<sigla>.md          il testo di ogni traccia (una volta sola)
  - <codice>.pseudocodice.txt   lo pseudocodice della consegna (se presente nel JSON)
  - <codice>.c                  il codice C (se presente)
  - <codice>.py                 il codice Python (se presente)
  - <codice>.info.txt           traccia e codice di riscontro della consegna

Non legge né scrive il file delle corrispondenze (codice → studente): resta tuo.
"""
import json
import sys
from pathlib import Path

ESTENSIONI = {"pseudocodice": ".pseudocodice.txt", "c": ".c", "python": ".py"}


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    dati = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    uscita = Path(argv[2])
    uscita.mkdir(parents=True, exist_ok=True)

    for sigla, t in dati.get("tracce", {}).items():
        (uscita / f"traccia-{sigla}.md").write_text(f"# {t.get('titolo', '')}\n\n{t.get('testo', '')}\n", encoding="utf-8")

    for c in dati.get("consegne", []):
        codice = c["codice"]
        for parte, estensione in ESTENSIONI.items():
            if parte in c and c[parte] is not None:
                (uscita / f"{codice}{estensione}").write_text(c[parte].rstrip("\n") + "\n", encoding="utf-8")
        info = [f"verifica: {dati.get('verifica', '')}", f"codice: {codice}", f"traccia: {c.get('traccia') or '-'}", f"riscontro: {c.get('riscontro', '-')}"]
        if c.get("illeggibile"):
            info.append("ATTENZIONE: programma non leggibile")
        (uscita / f"{codice}.info.txt").write_text("\n".join(info) + "\n", encoding="utf-8")

    print(f"{len(dati.get('consegne', []))} consegne scritte in {uscita}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
