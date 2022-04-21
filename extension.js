const fetch = require('isomorphic-fetch');
const { v4: uuid } = require('uuid');

module.exports = nodecg => {
  async function fetchTrackerData(baseURL, type, eventID) {
    const normalizedBaseURL = baseURL.endsWith('/') ? baseURL.substr(0, baseURL.length - 1) : baseURL;

    const response = await fetch(`${normalizedBaseURL}/search?type=${type}&event=${eventID}`);

    return await response.json();
  }

  function durationToSeconds(value) {
    if (!value) return 0;

    const sections = value.split(':');

    const seconds = Number(sections[sections.length - 1]);
    const minutes = Number(sections[sections.length - 2] || 0);
    const hours = Number(sections[sections.length - 3] || 0);

    return seconds + (minutes * 60) + (hours * 3600);
  }

  const gdqTrackerImportStatus = nodecg.Replicant('gdqTrackerImportStatus', {
    default: {
      isImporting: false,
      error: null,
      runsImported: null,
    },
  });

  const runDataArray = nodecg.Replicant('runDataArray', 'nodecg-speedcontrol');

  nodecg.listenFor('importGDQTrackerSchedule', async ({ trackerURL, eventID }, ack) => {
    nodecg.log.info('[GDQ Tracker Import] Schedule import started...');

    gdqTrackerImportStatus.value = {
      isImporting: true,
      error: null,
      runsImported: null,
    }

    try {
      const [runners, runs] = await Promise.all([
        fetchTrackerData(trackerURL, 'runner', eventID),
        fetchTrackerData(trackerURL, 'run', eventID),
      ]);

      runDataArray.value = runs
        .filter(({ fields }) => fields.order !== null && fields.order !== undefined)
        .map(run => {
          const matchesExistingRun = runDataArray.value.find(oldRun => oldRun.externalID === run.pk.toString());

          const runData = {
            teams: [],
            id: (matchesExistingRun ? matchesExistingRun.id : null) || uuid(),
            externalID: run.pk.toString(),
            customData: {},
          };

          runData.game = run.fields.display_name || undefined;
          runData.system = run.fields.console || undefined;
          runData.category = run.fields.category || undefined;
          runData.estimate = run.fields.run_time;
          runData.estimateS = durationToSeconds(run.fields.run_time);
          runData.setupTime = run.fields.setup_time;
          runData.setupTimeS = durationToSeconds(run.fields.setup_time);
          runData.gameTwitch = run.fields.twitch_name;
          runData.scheduled = run.fields.starttime;
          runData.scheduledS = Math.floor(Date.parse(run.fields.starttime) / 1000) + runData.setupTimeS + runData.estimateS;
          runData.teams = run.fields.runners.map(runnerId => {
            const team = {
              id: uuid(),
              players: [],
            };

            const runnerData = runners.find(({ pk }) => pk === runnerId);
            
            if (!runnerData) {
              nodecg.log.warn(`[GDQ Tracker Import] No runner data found for the runner with ID ${runnerId}.`);

              return team;
            }

            const runner = {
              id: uuid(),
              name: runnerData.fields.name,
              teamID: team.id,
              social: {
                twitch: runnerData.fields.stream ? runnerData.fields.stream.replace('http://twitch.tv/', '').replace('https://twitch.tv/', '').replace('twitch.tv/', '') : undefined,
              },
              pronouns: runnerData.fields.pronouns || undefined,
              customData: {},
            };

            team.players.push(runner);

            return team;
          });

          return runData;
        });

      gdqTrackerImportStatus.value = {
        isImporting: false,
        error: null,
        runsImported: runDataArray.value.length,
      }
  
      nodecg.log.info('[GDQ Tracker Import] Schedule import complete!');
      
      if (ack && !ack.handled) ack(null);
    } catch (error) {
      nodecg.log.warn('[GDQ Tracker Import] Schedule import failed:', error);

      gdqTrackerImportStatus.value = {
        isImporting: false,
        error: error.message || error.error || error.toString(),
        runsImported: null,
      }

      if (ack && !ack.handled) ack(error);
    }
  });
};