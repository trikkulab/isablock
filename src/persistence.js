// Salvataggio/caricamento locale (nessun account, nessun server): il
// lavoro dello studente diventa un file .json scaricabile e ricaricabile,
// come richiesto dalla sezione "Persistenza" di docs/SPEC.md.
export function saveWorkspaceToFile(Blockly, workspace, filename = 'programma-a-blocchi.json') {
  const state = Blockly.serialization.workspaces.save(workspace);
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function loadWorkspaceFromFile(Blockly, workspace, file) {
  return file.text().then((text) => {
    const state = JSON.parse(text);
    workspace.clear();
    Blockly.serialization.workspaces.load(state, workspace);
  });
}
