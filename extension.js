const fetch = require('isomorphic-fetch');
const { v4: uuid } = require('uuid');

module.exports = nodecg => {
  async function fetchTrackerData(baseURL, eventID) {
    const normalizedBaseURL = baseURL.endsWith('/') ? baseURL.substr(0, baseURL.length - 1) : baseURL;

    const response = await fetch(`${normalizedBaseURL}/api/v2/events/${eventID}/runs`);

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

  nodecg.listenFor('importGDQTrackerSchedule', async ({ trackerURL, eventID, customData }, ack) => {
    nodecg.log.info('[GDQ Tracker Import] Schedule import started...');

    gdqTrackerImportStatus.value = {
      isImporting: true,
      error: null,
      runsImported: null,
    }

    try {
      const runList = await fetchTrackerData(trackerURL, eventID)

      let runArray = new Array();
      for(let i = 0; i < runList.count; i++) {
        // nodecg.log.info(`Run being processed: ${runList.results[i].name}`)

        let currentRun = runList.results[i];

          const newObj = {
            teams: [],
            id: i.toString(),
            externalID: currentRun.id.toString(),
            customData: {},
          };

          newObj.game = currentRun.name;
          newObj.category = currentRun.category;
          newObj.system = currentRun.console;
          newObj.release = currentRun.release_year?.toString() ?? undefined;
          newObj.estimate = currentRun.run_time;
          newObj.estimateS = durationToSeconds(currentRun.run_time);
          newObj.setupTime = currentRun.setup_time;
          newObj.setupTimeS = durationToSeconds(currentRun.setup_time);
          newObj.gameTwitch = currentRun.twitch_name;
          newObj.scheduled = currentRun.starttime;
          newObj.scheduledS = Math.floor(Date.parse(currentRun.starttime) / 1000) + newObj.setupTimeS + newObj.estimateS;
         
          const team = {
            id: uuid(),
            players: [],
          }

          if (currentRun.runners.length == 1) {
            const runner = {
              id: uuid(),
              name: currentRun.runners[0].name,
              teamID: team.id,
              social: {
                twitch: currentRun.runners[0].stream ? currentRun.runners[0].stream.replace('http://twitch.tv/', '').replace('https://twitch.tv/', '').replace('twitch.tv/', '') : undefined,
              },
              pronouns: currentRun.runners[0].pronouns || undefined,
              customData: {},
            };
              team.players.push(runner);
          } else {
              for (let j = 0; j < currentRun.runners.length; j++) {
                const runner = {
                  id: uuid(),
                  name: currentRun.runners[j].name,
                  teamID: team.id,
                  social: {
                    twitch: currentRun.runners[j].stream ? currentRun.runners[j].stream.replace('http://twitch.tv/', '').replace('https://twitch.tv/', '').replace('twitch.tv/', '') : undefined,
                  },
                  pronouns: currentRun.runners[j].pronouns || undefined,
                  customData: {},
                };
                team.players.push(runner);
              }
          } 

          newObj.teams.push(team);

          if (customData) {
            newObj.customData.layout = currentRun.layout ?? undefined;
            if (currentRun.hosts.length == 0) {
              newObj.customData.hostName = "None";
              newObj.customData.hostPronouns = "";
            } else {
              newObj.customData.hostName = currentRun.hosts[0].name;
              newObj.customData.hostPronouns = currentRun.hosts[0].pronouns != "" ? currentRun.hosts[0].pronouns : "No Pronouns";
            }

            if (currentRun.commentators.length >= 0) {
              if (currentRun.commentators.length >= 1) {
                if (currentRun.commentators.length >= 2) {
                  newObj.customData.commentator3Name = currentRun.commentators[2].name;
                  newObj.customData.commentator3Pronouns = currentRun.commentators[2].pronouns != "" ? currentRun.commentators[1].pronouns : "No Pronouns";
                }
                newObj.customData.commentator2Name = currentRun.commentators[1].name;
                newObj.customData.commentator2Pronouns = currentRun.commentators[1].pronouns != "" ? currentRun.commentators[1].pronouns : "No Pronouns";
             }
              newObj.customData.commentator1Name = currentRun.commentators[0].name;
              newObj.customData.commentator1Pronouns = currentRun.commentators[0].pronouns != "" ? currentRun.commentators[0].pronouns : "No Pronouns";
            } 
            
            
          }
          
          // nodecg.log.info(`Run processed: ${JSON.stringify(newObj)}`)
            
          runArray.push(newObj);
          }
      
      runDataArray.value = runArray;

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