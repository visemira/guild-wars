const { createApp } = Vue;

createApp({
    data() {
        return {
            tabs: [
                { name: 'Dashboard' },
                { name: 'Match' },
                { name: 'Logs' },
              ],
            activeTab: 0,
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
                const parsed = JSON.parse(savedData);

                Object.assign(this, {
                    members: parsed.members || {},
                    positions: parsed.positions || {},
                    guildsInfo: parsed.guildsInfo || {},
                    guilds: parsed.guilds || {},
                    logs: parsed.logs || [],
                    attackerGuildId: parsed.attackerGuildId || '',
                    defenderGuildId: parsed.defenderGuildId || '',
                    battleResults: parsed.battleResults || { attacker: {}, defender: {} },
                    assignments: parsed.assignments || { attacker: {}, defender: {} }
                });

                this.ensureAssignmentStructure();

                const today = new Date().toLocaleDateString();
                const lastCloseDate = localStorage.getItem('dialogClosedDate');
                this.showDialog = lastCloseDate !== today;

            } catch (error) {
                this.loadData();
            }
        } else {
            this.loadData();
        }
    },
    computed: {
        attackerMembers() {
            return this.guilds[this.attackerGuildId] || [];
        },
        defenderMembers() {
            return this.guilds[this.defenderGuildId] || [];
        },
        matchSummary() {
            const atkResults = Object.values(this.battleResults.attacker);
            const atkWins = atkResults.filter(r => r === 'Win').length;
            const atkLosses = atkResults.filter(r => r === 'Loss').length;

            return {
                attacker: { wins: atkWins, losses: atkLosses },
                defender: { wins: atkLosses, losses: atkWins }
            };
        }
    },
    watch: {
        attackerGuildId: 'saveToLocalStorage',
        defenderGuildId: 'saveToLocalStorage',
        assignments: { handler: 'saveToLocalStorage', deep: true },
        battleResults: { handler: 'saveToLocalStorage', deep: true },
        logs: { handler: 'saveToLocalStorage', deep: true }
    },
    methods: {
        closeDialog() {
            this.showDialog = false;
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
            localStorage.setItem('dialogClosedDate', new Date().toLocaleDateString());
            this.showDialog = false;
        },
        resetMatchData() {
            this.battleResults = { attacker: {}, defender: {} };
            this.logs = [];
            this.assignments = { attacker: {}, defender: {} };
            this.ensureAssignmentStructure();
        },
        ensureAssignmentStructure() {
            ['attacker', 'defender'].forEach(side => {
                this.assignments[side] = this.assignments[side] || {};
                for (const posId in this.positions) {
                    const { name, position: count } = this.positions[posId];
                    this.assignments[side][name] = this.assignments[side][name] || {};
                    for (let i = 1; i <= count; i++) {
                        this.assignments[side][name][i] = this.assignments[side][name][i] || '';
                    }
                }
            });
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
                this.guilds = Object.fromEntries(guildsJson.guilds.map(g => [g.id, g.members]));
                this.resetMatchData();
            })
            .catch(err => console.error('Error loading data:', err));
        },
        resetAll() {
            localStorage.clear();
            location.reload();
        },
        clearAssignment(side, position, slot) {
            this.assignments[side][position][slot] = '';
            this.logAssignment(side, position, slot, '');
            this.recordBattleResult('', 'remove', side, position, slot);
        },
        logChange(action, details, guildId) {
            this.logs.push({
                timestamp: new Date().toLocaleString(),
                action,
                details: `${details}: ${this.guildsInfo[guildId]?.name || 'Unknown'}`
            });
        },
        logAssignment(side, position, slot, memberId) {
            const timestamp = new Date().toLocaleString();
            const today = new Date().toLocaleDateString();
            const slotLabel = `${side} - Position: ${position}, Slot: ${slot}`;
            const memberName = this.members[memberId]?.name || 'Unknown';

            this.logs = this.logs.filter(log => {
                const logDate = new Date(log.timestamp).toLocaleDateString();
                return !(
                    logDate === today &&
                    log.action === 'Assign Member' &&
                    (log.details.includes(slotLabel) || log.details.includes(`Member: ${memberName}`))
                );
            });

            if (memberId) {
                this.logs.push({
                    timestamp,
                    action: 'Assign Member',
                    details: `${slotLabel}, Member: ${memberName}`
                });
            }
        },
        recordBattleResult(memberId, result, side, position, slot) {
            const key = `${position}-${slot}`;
            const timestamp = new Date().toLocaleString();
            const today = new Date().toLocaleDateString();

            if (!memberId && result === 'remove') {
                this.logs = this.logs.filter(log => {
                    const logDate = new Date(log.timestamp).toLocaleDateString();
                    return !(logDate === today && log.action.startsWith('Battle Result') && log.details.includes(`(${position} Slot ${slot})`));
                });
                this.battleResults[side][key] = result;
                return;
            }

            const memberName = this.members[memberId]?.name || 'Unknown';

            if (side === 'attacker' && !this.assignments.defender?.[position]?.[slot]) return;

            this.logs = this.logs.filter(log => {
                const logDate = new Date(log.timestamp).toLocaleDateString();
                return !(logDate === today && log.action.startsWith('Battle Result') && log.details.includes(memberName));
            });

            this.battleResults[side][key] = result;
            this.logs.push({
                timestamp,
                action: `Battle Result - ${result}`,
                details: `${side} - ${memberName} (${position} Slot ${slot}) marked as ${result}`
            });
        },
        saveToLocalStorage() {
            localStorage.setItem('guildMatchData', JSON.stringify({
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
            }));
        },
        isMemberAlreadyAssigned(memberId, currentSide, currentPosId, currentSlot) {
            return ['attacker', 'defender'].some(side =>
                Object.entries(this.assignments[side] || {}).some(([posId, slots]) =>
                    Object.entries(slots).some(([slot, assignedId]) =>
                        assignedId === memberId &&
                        !(side === currentSide && posId === currentPosId && slot == currentSlot)
                    )
                )
            );
        },
        getBattleResultClass(side, position, slot) {
            const result = this.battleResults[side]?.[`${position}-${slot}`];
            return result === 'Win' ? 'bg-green-100 border-green-500'
                 : result === 'Loss' ? 'bg-red-100 border-red-500'
                 : '';
        },
        downloadLogsAsCSV() {
            if (!this.logs.length) return;

            const header = ['Timestamp', 'Action', 'Details'];
            const rows = this.logs.map(log => [log.timestamp, log.action, log.details]);
            const csv = [header, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(blob),
                download: 'guild_match_logs.csv'
            });
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}).mount('#app');
