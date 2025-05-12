(() => {
  const importSettingsElement = document.querySelector('.import-settings');
  const statusTextElement = document.querySelector('.status-text');

  function setStatusText(text) {
    if (text) {
      statusTextElement.classList.remove('hidden');
      statusTextElement.textContent = text;
    } else {
      statusTextElement.classList.add('hidden');
    }
  }
  
  const gdqTrackerImportStatus = nodecg.Replicant('gdqTrackerImportStatus', {
    default: {
      isImporting: false,
      error: null,
      runsImported: null,
    },
  });

  gdqTrackerImportStatus.on('change', ({ isImporting, error, runsImported }) => {
    if (isImporting) {
      importSettingsElement.classList.add('hidden');
      setStatusText('Importing...');
    } else {
      importSettingsElement.classList.remove('hidden');

      if (error) {
        setStatusText(error);
      } else if (runsImported !== null && runsImported !== undefined) {
        setStatusText(`Imported ${runsImported} run(s).`);
      } else {
        setStatusText(null);
      }
    }
  });

  document.querySelector('.start-import').addEventListener('click', () => {
    const trackerURL = document.querySelector('#trackerURL').value;
    const eventID = document.querySelector('#eventID').value;
    const customData = document.querySelector('#customData').checked;
    
    nodecg.sendMessage('importGDQTrackerSchedule', {
      trackerURL,
      eventID,
      customData
    });
  });
})();