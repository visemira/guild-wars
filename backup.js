const { createApp } = Vue;

createApp({
    data() {
        return {
            showDialog: true,
            members: {},
            guilds: {},
            guildsInfo: {},
            positions: {},
            attackerGuildId: '',
            defenderGuildId: '',
            assignments: { attacker: {}, defender: {} },
            battleResults: { attacker: {}, defender: {} },
            logs: []
        };
    },
    created() {
        const savedData = localStorage.getItem('guildMatchData');

        if (savedData) {
            try {
                const parsedData = JSON.parse(savedData);

                this.members = parsedData.members || {};
                this.positions = parsedData.positions || {};
                this.guildsInfo = parsedData.guildsInfo || {};
                this.guilds = parsedData.guilds || {};
                this.logs = parsedData.logs || [];
                this.attackerGuildId = parsedData.attackerGuildId || '';
                this.defenderGuildId = parsedData.defenderGuildId || '';
                this.battleResults = parsedData.battleResults || { attacker: {}, defender: {} };

                this.assignments = parsedData.assignments || { attacker: {}, defender: {} };
                this.ensureAssignmentStructure();

                const lastCloseDate = localStorage.getItem('dialogClosedDate');
                const today = new Date().toLocaleDateString();
                this.showDialog = lastCloseDate !== today;
            } catch (error) {
                console.error('Error parsing saved data:', error);
                this.loadData();
            }
        } else {
            this.loadData();
        }
    },
    mounted() {},
    computed: {
        attackerMembers() {
            return this.attackerGuildId ? this.guilds[this.attackerGuildId] || [] : [];
        },
        defenderMembers() {
            return this.defenderGuildId ? this.guilds[this.defenderGuildId] || [] : [];
        },
        matchSummary() {
            let atkWins = 0;
            let atkLosses = 0;

            for (const key in this.battleResults.attacker) {
                const result = this.battleResults.attacker[key];
                if (result === 'Win') atkWins++;
                if (result === 'Loss') atkLosses++;
            }

            return {
                attacker: { wins: atkWins, losses: atkLosses },
                defender: { wins: atkLosses, losses: atkWins }
            };
        }
    },
    watch: {
        attackerGuildId() { this.saveToLocalStorage(); },
        defenderGuildId() { this.saveToLocalStorage(); },
        assignments: {
            handler() { this.saveToLocalStorage(); },
            deep: true
        },
        battleResults: {
            handler() { this.saveToLocalStorage(); },
            deep: true
        },
        logs: {
            handler() { this.saveToLocalStorage(); },
            deep: true
        }
    },
    methods: {
      clearAssignment(side, position, slot, memberId) {
        
        // Clear the assignment
        this.assignments[side][position][slot] = '';

        // Log the clearing action — reuses existing logic
        this.logAssignment(side, position, slot, '');
        this.recordBattleResult('','remove',side, position, slot)
      },
        checkSelection() {
            if (this.attackerGuildId && this.defenderGuildId) {
                this.startMatch();
            }
        },
        startMatch() {
            this.resetMatchData();
            localStorage.setItem('attackerGuild', this.attackerGuildId);
            localStorage.setItem('defenderGuild', this.defenderGuildId);
            const today = new Date().toLocaleDateString();
            localStorage.setItem('dialogClosedDate', today);
            this.showDialog = false;
        },
        closeDialog() {
            this.showDialog = false;
        },
        resetMatchData() {
            this.battleResults = { attacker: {}, defender: {} };
            this.logs = [];
            this.assignments = { attacker: {}, defender: {} };
            this.ensureAssignmentStructure();
        },
        ensureAssignmentStructure() {
            const sides = ['attacker', 'defender'];
            for (const side of sides) {
                if (!this.assignments[side]) {
                    this.assignments[side] = {};
                }

                for (const posId in this.positions) {
                    const position = this.positions[posId];
                    const name = position.name;
                    const count = position.position;

                    if (!this.assignments[side][name]) {
                        this.assignments[side][name] = {};
                    }

                    for (let i = 1; i <= count; i++) {
                        if (typeof this.assignments[side][name][i] !== 'string') {
                            this.assignments[side][name][i] = '';
                        }
                    }
                }
            }
        },
        resetAll() {
            localStorage.clear();
            location.reload();
        },
        loadData() {
            Promise.all([
                fetch('data/server_345/members_meta.json').then(res => res.json()),
                fetch('data/positions.json').then(res => res.json()),
                fetch('data/server_345/guilds.json').then(res => res.json()),
                fetch('data/server_345/guilds_meta.json').then(res => res.json())
            ])
            .then(([members, positions, guildsJson, guildsInfo]) => {
                this.members = members;
                this.positions = positions;
                this.guildsInfo = guildsInfo;
                this.guilds = {};
                for (const g of guildsJson.guilds) {
                    this.guilds[g.id] = g.members;
                }
                this.resetMatchData();
            })
            .catch(err => console.error('Error loading data:', err));
        },
        getBattleResultClass(side, position, slot) {
            const key = `${position}-${slot}`;
            const result = this.battleResults[side]?.[key];
            if (result === 'Win') return 'bg-green-100 border-green-500';
            if (result === 'Loss') return 'bg-red-100 border-red-500';
            return '';
        },
        logChange(action, details, guildId) {
            const timestamp = new Date().toLocaleString();
            this.logs.push({
                timestamp,
                action,
                details: `${details}: ${this.guildsInfo[guildId]?.name || 'Unknown'}`
            });
        },
        logAssignment(side, position, slot, memberId) {
          const timestamp = new Date().toLocaleString();
          const today = new Date().toLocaleDateString();

          const slotIdentifier = `${side} - Position: ${position}, Slot: ${slot}`;

          // If memberId is empty (slot cleared), remove related log and return early
          this.logs = this.logs.filter(log => {
              const logDate = new Date(log.timestamp).toLocaleDateString();
              const isSameDay = logDate === today;
              const isSameSlot = log.action === 'Assign Member' && log.details.includes(`${side} - Position: ${position}, Slot: ${slot}`);
              return !(isSameDay && isSameSlot);
          });
          if (!memberId) {
            return;
          }

          const memberName = this.members[memberId]?.name || 'Unknown';

          // Remove previous assignment for the same member on the same day
          this.logs = this.logs.filter(log => {
              const logDate = new Date(log.timestamp).toLocaleDateString();
              const isSameDay = logDate === today;
              const isSameMember = log.action === 'Assign Member' && log.details.includes(`Member: ${memberName}`);
              return !(isSameDay && isSameMember);
          });

          // Log new assignment
          this.logs.push({
              timestamp,
              action: 'Assign Member',
              details: `${side} - Position: ${position}, Slot: ${slot}, Member: ${memberName}`
          });
      }

      ,
        recordBattleResult(memberId, result, side, position, slot) {
            const key = `${position}-${slot}`;
            const timestamp = new Date().toLocaleString();
            const today = new Date().toLocaleDateString();
            if(!memberId){
                if(result === "remove"){
                    this.logs = this.logs.filter(log => {
                        const logDate = new Date(log.timestamp).toLocaleDateString();
                        return !(
                            logDate === today &&
                            log.action.startsWith('Battle Result') &&
                            log.details.includes(`(${position} Slot ${slot})`)
                        );
                    });
                }
                this.battleResults[side][key] = result;
                return;
            }
            const memberName = this.members[memberId]?.name || 'Unknown';
            if (side === 'attacker') {
                const defenderAssignment = this.assignments.defender?.[position]?.[slot];
                if (!defenderAssignment) {
                    return;
                }
            }
            // Remove previous battle result logs for this member on today
            this.logs = this.logs.filter(log => {
                const logDate = new Date(log.timestamp).toLocaleDateString();
                return !(
                    logDate === today &&
                    log.action.startsWith('Battle Result') &&
                    log.details.includes(`${memberName}`)
                );
            });

            this.battleResults[side][key] = result;
            this.logs.push({
                timestamp,
                action: `Battle Result - ${result}`,
                details: `${side} - ${memberName} (${position} Slot ${slot}) marked as ${result}`
            });
        }
        ,
        saveToLocalStorage() {
            const data = {
                members: this.members,
                positions: this.positions,
                guildsInfo: this.guildsInfo,
                guilds: this.guilds,
                assignments: this.assignments,
                logs: this.logs,
                attackerGuildId: this.attackerGuildId,
                defenderGuildId: this.defenderGuildId,
                battleResults: this.battleResults,
                showDialog: this.showDialog
            };
            localStorage.setItem('guildMatchData', JSON.stringify(data));
        },
        isMemberAlreadyAssigned(memberId, currentSide, currentPosId, currentSlot) {
            for (const side of ['attacker', 'defender']) {
                for (const posId in this.assignments[side]) {
                    for (const slot in this.assignments[side][posId]) {
                        const assigned = this.assignments[side][posId][slot];
                        if (assigned === memberId && !(side === currentSide && posId === currentPosId && slot == currentSlot)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        },
        downloadLogsAsCSV() {
            if (!this.logs.length) return;

            const header = ['Timestamp', 'Action', 'Details'];
            const rows = this.logs.map(log => [log.timestamp, log.action, log.details]);

            const csvContent = [header, ...rows].map(e => e.map(cell => `"${cell}"`).join(',')).join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', 'guild_match_logs.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}).mount('#app');