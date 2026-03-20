
import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { commitTransaction, rollbackTransaction, StartPool, StartPT } from '../../database/database.js';
import { deleteMatchFromCalendar, syncMatchToCalendar } from '../services/calendarService.js'

async function deleteMatch(args) {
    async function deleteMatch_Query({ pool, MatchId }) {
        var data = [ MatchId ];
        var sql_query = 'DELETE FROM matches WHERE id = $1';

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting match');
        }
    
        return;
    }

    try {
        var { MatchId } = args;

        var pool = await StartPT();

        var eventId = await getMatchCalendarId({ pool, MatchId });

        await deleteMatch_Query({ pool, MatchId });

        await deleteMatchFromCalendar({ eventId });

        await commitTransaction(pool);

        return ({ Response: 1 });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function deleteMatchEvent(args) {
    async function deleteMatchEvent_Query({ pool, MatchEventId }) {
        var data = [ MatchEventId ];
        var sql_query = 'DELETE FROM match_events WHERE id = $1';

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting match event');
        }

        data = [ MatchEventId ];
        sql_query = 'DELETE FROM match_events_details WHERE matcheventid = $1';

        result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting match event');
        }
    
        return;
    }

    try {
        var { MatchEventId } = args;

        var pool = await StartPT();

        await deleteMatchEvent_Query({ pool, MatchEventId });

        await commitTransaction(pool);

        return ({ Response: 1 });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getGoalTypes() {
    async function getGoalTypes_Query({ pool }) {
        var baseQuery = `SELECT id GoalTypeId, name GoalTypeName FROM goal_types`;
        let countQuery = 'SELECT COUNT(*) FROM goal_types';
        let values = [];
        let countValues = [];

        baseQuery += ' ORDER BY id ASC';

        const dataResult = await pool.query(baseQuery, values);
        const countResult = await pool.query(countQuery, countValues);

        var GoalTypes = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;

        return { GoalTypes, IsMoreResults: 0, TotalRecords };
    }

    try {
        var pool = await StartPool();

        var { GoalTypes, IsMoreResults, TotalRecords } = await getGoalTypes_Query({ pool });

        return ({ Response: 1, GoalTypes, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getMatchCalendarId({ pool, MatchId }) {
    const sql = `SELECT google_calendar_event_id FROM matches WHERE id = $1`;

    const result = await pool.query(sql, [MatchId]);
    return result.rows[0].google_calendar_event_id;
}

async function getMatchDetail(args) {
    async function getMatchDetail_Query({ pool, MatchId }) {
        var baseQuery = `
            SELECT M.id MatchId, E.id EventId, CONCAT(C.name, ' - ', T.name, ' - ', S.name) EventName, M.matchdate MatchDate, M.track_starts TrackStarts, TO_CHAR(M.matchdate, 'YYYY-MM-DD HH:MI AM') MatchDate_Formatted, M.opponentid OpponentId, Opponents.name OpponentName, CASE WHEN homeaway = 'Home' THEN 1 WHEN homeaway = 'Away' THEN 2 WHEN homeaway = 'Neutral' THEN 3 ELSE 0 END HomeAwayId, homeaway HomeAwayName, L.id LocationId, L.name LocationName, MT.id MatchTypeId, CASE WHEN MT.knockoutroundid = 0 THEN Lvl.name ELSE CONCAT(Lvl.name, ' - ', KR.name) END MatchTypeName, MS.id MatchStatusId, MS.name MatchStatusName, TeamScore, OpponentScore, CONCAT(M.teamscore, ' - ', M.opponentscore) Score, M.matchresult MatchResult
            FROM matches M
            JOIN events E ON E.id = M.eventid
            JOIN competitions C ON C.id = E.competitionid
            JOIN teams T ON T.id = E.teamid
            JOIN seasons S ON S.id = E.seasonid
            JOIN teams Opponents ON Opponents.id = M.opponentid
            JOIN locations L ON L.id = M.locationid
            JOIN match_types MT ON MT.id = M.matchtypeid
            JOIN levels Lvl ON Lvl.id = MT.levelid
            LEFT JOIN knockout_rounds KR ON KR.id = MT.knockoutroundid AND MT.knockoutroundid <> 0
            JOIN match_status MS ON MS.id = M.matchstatusid
            WHERE M.id = $1
        `;
        let values = [ MatchId ];

        const dataResult = await pool.query(baseQuery, values);

        var MatchDetails = dataResult.rows[0];

        return MatchDetails;
    }

    async function getMatchRoster_Query({ pool, MatchId }) {
        var baseQuery = `
            SELECT MR.playerid PlayerId, P.name PlayerName, MR.start, MR.sub, MR.mom, MR.captain
            FROM match_roster MR
            JOIN players P ON P.id = MR.playerid
            WHERE matchid = $1
            ORDER BY P.name ASC;
        `;
        let values = [ MatchId ];

        const dataResult = await pool.query(baseQuery, values);

        var MatchRoster = dataResult.rows.map(({ playerid: PlayerId, playername: PlayerName, start: Start, sub: Sub, mom: Mom, captain: Captain }) => ({ PlayerId, PlayerName, Start, Sub, Mom, Captain }));

        return MatchRoster;
    }

    async function getMatchStats_Query({ pool, MatchId }) {
        var baseQuery = `
            SELECT ME.id MatchEventId, ME.matcheventtypeid ParentMatchEventTypeId, MET2.name ParentMatchEventTypeName, MED.matcheventtypeid MatchEventTypeId, ME.timeofgame TimeOfGame, MED.playerid PlayerId, P.name PlayerName, COALESCE(GT.id, 0) GoalTypeId, COALESCE(GT.name, '') GoalTypeName
            FROM match_events ME
            JOIN match_events_details MED ON MED.matcheventid = ME.id
            JOIN match_event_types MET ON MET.id = MED.matcheventtypeid
            JOIN match_event_types MET2 ON MET2.id = ME.matcheventtypeid
            LEFT JOIN goal_types GT ON GT.id = MED.goaltypeid AND ME.matcheventtypeid = 3
            JOIN players P ON P.id = MED.playerid
            WHERE matchid = $1
            ORDER BY timeofgame ASC, MET.priority ASC
        `;
        let values = [ MatchId ];

        const dataResult = await pool.query(baseQuery, values);

        var MatchStats = [];
        var MatchStats_Index = [];

        for (var i = 0; i < dataResult.rows.length; i++) {
            var { matcheventid, matcheventtypeid, parentmatcheventtypeid, parentmatcheventtypename, timeofgame, playerid, playername, goaltypeid, goaltypename } = dataResult.rows[i];

            var MatchStats_Index_Index = MatchStats_Index.indexOf(+timeofgame);
            if (MatchStats_Index_Index === -1) {
                MatchStats_Index.push(timeofgame);
                MatchStats.push({ MatchEventId: matcheventid, ParentMatchEventTypeId: parentmatcheventtypeid, ParentMatchEventTypeName: parentmatcheventtypename, TimeOfGame: timeofgame, Events: [] });

                MatchStats_Index_Index = MatchStats_Index.length - 1;
            }

            MatchStats[MatchStats_Index_Index].Events.push({ MatchEventTypeId: matcheventtypeid, PlayerId: playerid, PlayerName: playername, GoalTypeId: goaltypeid, GoalTypeName: goaltypename });
        }

        return MatchStats;
    }

    try {
        var { MatchId = 0 } = args;

        var pool = await StartPool();

        var MatchDetails = await getMatchDetail_Query({ pool, MatchId });
        var MatchRoster = await getMatchRoster_Query({ pool, MatchId });
        var MatchStats = await getMatchStats_Query({ pool, MatchId });

        return ({ Response: 1, MatchDetails, MatchRoster, MatchStats });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getMatchEventTypes() {
    async function getMatchEventTypes_Query({ pool }) {
        var baseQuery = `SELECT id MatchEventTypeId, name MatchEventTypeName FROM match_event_types WHERE selectable = 1`;
        let countQuery = 'SELECT COUNT(*) FROM match_event_types WHERE selectable = 1';
        let values = [];
        let countValues = [];

        baseQuery += ' ORDER BY name ASC';

        const dataResult = await pool.query(baseQuery, values);
        const countResult = await pool.query(countQuery, countValues);

        var MatchEventTypes = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;

        return { MatchEventTypes, IsMoreResults: 0, TotalRecords };
    }

    try {
        var pool = await StartPool();

        var { MatchEventTypes, IsMoreResults, TotalRecords } = await getMatchEventTypes_Query({ pool });

        return ({ Response: 1, MatchEventTypes, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getMatches(args) {
    async function getMatches_Query({ pool, CompetitionIds, DateRange, EndDate, EventIds, GetAll, OpponentIds, SeasonIds, StartDate, TeamIds, PageNo, PageSize }) {
        var baseQuery = `
            SELECT
                M.id MatchId, E.id EventId, CONCAT(C.name, ' - ', T.name, ' - ', S.name) EventName, E.color EventColor,
                M.matchdate MatchDate, M.matchdate + INTERVAL '2 hours' MatchEnd, M.track_starts TrackStarts, TO_CHAR(M.matchdate, 'YYYY-MM-DD HH:MI AM') MatchDate_Formatted,
                M.opponentid OpponentId, Opponents.name OpponentName,
                CASE WHEN homeaway = 'Home' THEN 1 WHEN homeaway = 'Away' THEN 2 WHEN homeaway = 'Neutral' THEN 3 ELSE 0 END HomeAwayId, homeaway HomeAwayName,
                L.id LocationId, L.name LocationName,
                MT.id MatchTypeId, CASE WHEN MT.knockoutroundid = 0 THEN Lvl.name ELSE CONCAT(Lvl.name, ' - ', KR.name) END MatchTypeName,
                MS.id MatchStatusId, MS.name MatchStatusName,
                TeamScore, OpponentScore, CONCAT(M.teamscore, ' - ', M.opponentscore) Score, M.matchresult MatchResult,
                CASE WHEN M.matchstatusid = 4 THEN TRUE ELSE EXISTS (SELECT 1 FROM match_roster MR WHERE MR.matchid = M.id) END AS HasRoster,
                CASE WHEN (COALESCE(M.matchresult, '') <> '') THEN CASE WHEN (M.teamscore <> 0 AND M.matchstatusid = 2) THEN EXISTS (SELECT 1 FROM match_events ME WHERE ME.matchid = M.id) ELSE TRUE END ELSE FALSE END HasStats
            FROM matches M
            JOIN events E ON E.id = M.eventid
            JOIN competitions C ON C.id = E.competitionid
            JOIN teams T ON T.id = E.teamid
            JOIN seasons S ON S.id = E.seasonid
            JOIN teams Opponents ON Opponents.id = M.opponentid
            JOIN locations L ON L.id = M.locationid
            JOIN match_types MT ON MT.id = M.matchtypeid
            JOIN levels Lvl ON Lvl.id = MT.levelid
            LEFT JOIN knockout_rounds KR ON KR.id = MT.knockoutroundid AND MT.knockoutroundid <> 0
            JOIN match_status MS ON MS.id = M.matchstatusid
            WHERE TRUE
        `;
        let countQuery = 'SELECT COUNT(*) FROM matches M JOIN events E on E.id = M.eventid WHERE TRUE';
        let values = [];
        let countValues = [];

        if (StartDate !== '' && EndDate !== '') {
            baseQuery += ' AND CAST(M.matchdate AS DATE) BETWEEN CAST($' + (values.length + 1) + ' AS DATE) AND CAST($' + (values.length + 2) + ' AS DATE) AND M.matchstatusid <> 5';
            values.push(StartDate); values.push(EndDate);

            countQuery += ' AND CAST(M.matchdate AS DATE) BETWEEN CAST($' + (countValues.length + 1) + ' AS DATE) AND CAST($' + (countValues.length + 2) + ' AS DATE) AND M.matchstatusid <> 5';
            countValues.push(StartDate); countValues.push(EndDate);
        }

        if (CompetitionIds.length > 0) {
            baseQuery += ' AND E.competitionid = ANY($' + (values.length + 1) + '::int[])';
            countQuery += ' AND E.competitionid = ANY($' + (values.length + 1) + '::int[])';
            values.push(CompetitionIds);
            countValues.push(CompetitionIds);
        }

        if (EventIds.length > 0) {
            baseQuery += ' AND E.id = ANY($' + (values.length + 1) + '::int[])';
            countQuery += ' AND E.id = ANY($' + (values.length + 1) + '::int[])';
            values.push(EventIds);
            countValues.push(EventIds);
        }

        if (SeasonIds.length > 0) {
            baseQuery += ' AND E.seasonid = ANY($' + (values.length + 1) + '::int[])';
            countQuery += ' AND E.seasonid = ANY($' + (values.length + 1) + '::int[])';
            values.push(SeasonIds);
            countValues.push(SeasonIds);
        }

        if (OpponentIds.length > 0) {
            baseQuery += ' AND M.opponentid = ANY($' + (values.length + 1) + '::int[])';
            countQuery += ' AND M.opponentid = ANY($' + (values.length + 1) + '::int[])';
            values.push(OpponentIds);
            countValues.push(OpponentIds);
        }

        if (TeamIds.length > 0) {
            baseQuery += ' AND E.teamid = ANY($' + (values.length + 1) + '::int[])';
            countQuery += ' AND E.teamid = ANY($' + (values.length + 1) + '::int[])';
            values.push(TeamIds);
            countValues.push(TeamIds);
        }

        if (DateRange === 'Past') {
            baseQuery += ' AND (CAST(M.matchdate AS DATE) < CAST($' + (values.length + 1) + ' AS DATE) OR M.matchstatusid = 2) AND M.matchstatusid <> 5';
            countQuery += ' AND (CAST(matchdate AS DATE) < CAST($' + (countValues.length + 1) + ' AS DATE) OR M.matchstatusid = 2) AND matchstatusid <> 5';

            values.push(new Date());
            countValues.push(new Date());

            baseQuery += ` ORDER BY M.matchdate DESC`;
        } else if (DateRange === 'Future') {
            baseQuery += ' AND CAST(M.matchdate AS DATE) >= CAST($' + (values.length + 1) + ' AS DATE) AND M.matchstatusid NOT IN (2, 5)';
            countQuery += ' AND CAST(matchdate AS DATE) >= CAST($' + (countValues.length + 1) + ' AS DATE) AND matchstatusid NOT IN (2, 5)';

            values.push(new Date());
            countValues.push(new Date());

            baseQuery += ` ORDER BY M.matchdate ASC`;
        } else if (DateRange === 'Postponed') {
            baseQuery += ' AND M.matchstatusid = 5';
            countQuery += ' AND matchstatusid = 5';

            baseQuery += ` ORDER BY M.matchdate ASC`;
        }

        if (!GetAll) {
            const offset = (PageNo - 1) * PageSize;
            baseQuery += ' LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
            values.push(PageSize, offset);
        }

        const dataResult = await pool.query(baseQuery, values);
        const countResult = await pool.query(countQuery, countValues);

        var Matches = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;
        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { Matches, IsMoreResults, TotalRecords };
    }

    try {
        var { CompetitionIds = '', DateRange = '', EndDate = '', EventIds = '', GetAll = 0, OpponentIds = '', SeasonIds = '', StartDate = '', TeamIds = '', PageNo = 1, PageSize = 10 } = args;

        var pool = await StartPool();

        var { Matches, IsMoreResults, TotalRecords } = await getMatches_Query({ pool, CompetitionIds, DateRange, EndDate, EventIds, GetAll, OpponentIds, SeasonIds, StartDate, TeamIds, PageNo, PageSize });

        return ({ Response: 1, Matches, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getMatchStatuses(args) {
    async function getMatchStatuses_Query({ pool, GetAll, SearchName, PageNo, PageSize }) {
        var baseQuery = `SELECT id MatchStatusId, name MatchStatusName FROM match_status WHERE TRUE`;
        let countQuery = 'SELECT COUNT(*) FROM match_status WHERE TRUE';
        let values = [];
        let countValues = [];

        if (SearchName !== '') {
            baseQuery += ' AND name LIKE $' + (values.length + 1);
            countQuery += ' AND name LIKE $' + (countValues.length + 1);
            values.push(`%${SearchName}%`);
            countValues.push(`%${SearchName}%`);
        }

        baseQuery += ' ORDER BY name ASC';

        if (!GetAll) {
            const offset = (PageNo - 1) * PageSize;
            baseQuery += ' LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
            values.push(PageSize, offset);
        }

        const dataResult = await pool.query(baseQuery, values);
        const countResult = await pool.query(countQuery, countValues);

        var MatchStatuses = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;
        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { MatchStatuses, IsMoreResults, TotalRecords };
    }

    try {
        var { GetAll = 0, SearchName = '', PageNo = 1, PageSize = 10 } = args;

        var pool = await StartPool();

        var { MatchStatuses, IsMoreResults, TotalRecords } = await getMatchStatuses_Query({ pool, GetAll, SearchName, PageNo, PageSize });

        return ({ Response: 1, MatchStatuses, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getMatchTypes(args) {
    async function getMatchTypes_Query({ pool, GetAll, PageNo, PageSize }) {
        var baseQuery = `
            SELECT MT.id MatchTypeId, CASE WHEN MT.knockoutroundid = 0 THEN Lvl.name ELSE CONCAT(Lvl.name, ' - ', KR.name) END MatchTypeName
            FROM match_types MT
            JOIN levels Lvl ON Lvl.id = MT.levelid
            LEFT JOIN knockout_rounds KR ON KR.id = MT.knockoutroundid
            WHERE TRUE`;
        let countQuery = 'SELECT COUNT(*) FROM match_types WHERE TRUE';
        let values = [];
        let countValues = [];

        baseQuery += ' ORDER BY Lvl.id ASC, KR.id ASC';

        if (!GetAll) {
            const offset = (PageNo - 1) * PageSize;
            baseQuery += ' LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
            values.push(PageSize, offset);
        }

        const dataResult = await pool.query(baseQuery, values);
        const countResult = await pool.query(countQuery, countValues);

        var MatchTypes = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;
        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { MatchTypes, IsMoreResults, TotalRecords };
    }

    try {
        var { GetAll = 0, PageNo = 1, PageSize = 10 } = args;

        var pool = await StartPool();

        var { MatchTypes, IsMoreResults, TotalRecords } = await getMatchTypes_Query({ pool, GetAll, PageNo, PageSize });

        return ({ Response: 1, MatchTypes, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function insertEditMatch(args) {
    async function getMatchTextDetails({ pool, EventId, OpponentId, LocationId, MatchTypeId }) {
        const sql = `
            SELECT
                (SELECT c.name FROM events e JOIN competitions c ON e.competitionid = c.id WHERE e.id = $1) competition_name,
                (SELECT COALESCE(google_calendar_color_id, 9) FROM events WHERE id = $1) event_color,
                (SELECT name FROM teams WHERE id = $2) AS opponent_name,
                (SELECT COALESCE(t.nickname, t.name) FROM teams t JOIN events e ON e.teamid = t.id WHERE e.id = $1) AS team_name,
                (SELECT name FROM locations WHERE id = $3) AS location_name,
                (SELECT CONCAT(l.name, ' ', kr.name) FROM match_types mt JOIN levels l ON l.id = mt.levelid LEFT JOIN knockout_rounds kr ON kr.id = mt.knockoutroundid WHERE mt.id = $4) AS match_type_name;
        `;

        const result = await pool.query(sql, [EventId, OpponentId, LocationId, MatchTypeId]);
        return result.rows[0];
    }

    async function insertEditMatch_Query({ pool, EventId, HomeAway, LocationId, MatchDate, MatchId, MatchStatusId, MatchTypeId, OpponentId, OpponentScore, TeamScore, TrackStarts }) {
        var data = [];
        var sql_query = '';

        var MatchResult = '';
        if ((TeamScore !== '' && OpponentScore !== '') && (TeamScore !== null && OpponentScore !== null)) {
            if (+TeamScore > +OpponentScore) MatchResult = 'WIN';
            else if (+TeamScore === +OpponentScore) MatchResult = 'TIE';
            else MatchResult = 'LOSS';
        }
        else {
            OpponentScore = null;
            TeamScore = null;
        }

        if (+MatchId) {
            data = [ EventId, HomeAway, LocationId, MatchDate, MatchResult, MatchStatusId, MatchTypeId, OpponentId, OpponentScore, TeamScore, TrackStarts, new Date(), MatchId ];
            sql_query = 'UPDATE matches SET eventid = $1, homeaway = $2, locationid = $3, matchdate = $4, matchresult = $5, matchstatusid = $6, matchtypeid = $7, opponentid = $8, opponentscore = $9, teamscore = $10, track_starts = $11, updated_at = $12 WHERE id = $13 RETURNING *';
        }
        else {
            data = [ EventId, HomeAway, LocationId, MatchDate, MatchResult, MatchStatusId, MatchTypeId, OpponentId, OpponentScore, TeamScore, TrackStarts ];
            sql_query = 'INSERT INTO matches (eventid, homeaway, locationid, matchdate, matchresult, matchstatusid, matchtypeid, opponentid, opponentscore, teamscore, track_starts) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *';
        }

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error inserting / editing match');
        }
    
        return result.rows[0];
    }

    try {
        var { EventId, HomeAway, LocationId, MatchDate, MatchId, MatchStatusId, MatchTypeId, OpponentId, OpponentScore, TeamScore, TrackStarts } = args;

        var pool = await StartPT();

        // InsertEdit match to DB
            var Match = await insertEditMatch_Query({ pool, EventId, HomeAway, LocationId, MatchDate, MatchId, MatchStatusId, MatchTypeId, OpponentId, OpponentScore, TeamScore, TrackStarts });

        // InsertEdit match to Calendar
            const details = await getMatchTextDetails({ pool, EventId, OpponentId, LocationId, MatchTypeId });

            const calendarData = await syncMatchToCalendar({
                eventId: Match.google_calendar_event_id, // Will be null for new matches
                matchDate: MatchDate,
                homeAway: HomeAway,
                opponentName: details.opponent_name,
                teamName: details.team_name,
                competitionName: details.competition_name,
                eventColor: details.event_color,
                matchTypeName: details.match_type_name,
                locationName: details.location_name,
                matchStatusId: MatchStatusId
            });

            // 5. If this was a newly inserted event, save the Google ID back to the matches table
            if (!Match.google_calendar_event_id && calendarData.id) {
                await pool.query(
                    'UPDATE matches SET google_calendar_event_id = $1 WHERE id = $2', 
                    [calendarData.id, Match.id]
                );
                Match.google_calendar_event_id = calendarData.id; // Update the returned object
            }

        await commitTransaction(pool);

        return ({ Response: 1, Match });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function insertEditMatchEvent(args) {
    async function insertEditMatchEvent_Query({ pool, MatchEventId, MatchEvents, MatchEventTypeId, MatchId, TimeOfGame }) {
        var values = [];
        var sql_query = '';

        var IsNew = false;

        // Update / Insert Match Event
            if (!!+MatchEventId) {
                values = [ MatchEventTypeId, TimeOfGame, MatchEventId ];
                sql_query = 'UPDATE match_events SET matcheventtypeid = $1, timeofgame = $2 WHERE id = $3 RETURNING *';
            }
            else {
                IsNew = true;

                values = [ MatchId, MatchEventTypeId, TimeOfGame ];
                sql_query = 'INSERT INTO match_events (matchid, matcheventtypeid, timeofgame) VALUES ($1, $2, $3) RETURNING *';
            }

            var result = await pool.query(sql_query, values);
        
            if (result.rowCount === 0) {
                throw new Error('Error inserting / editing match event');
            }

            MatchEventId = +MatchEventId || result.rows[0].id;

        // Delete Match Events For That Match Event
            if (!IsNew) {
                values = [ MatchEventId ];
                sql_query = 'DELETE FROM match_events_details WHERE matcheventid = $1';
                    
                result = await pool.query(sql_query, values);
            
                if (result.rowCount === 0) {
                    throw new Error('Error deleting match event details');
                }
            }

        // Insert New Match Events
            sql_query = 'INSERT INTO match_events_details (matcheventid, playerid, matcheventtypeid, goaltypeid) VALUES ';
            values = [];

            MatchEvents = MatchEvents.filter(({ PlayerId, MatchEventTypeId }) => {
                if (!!+PlayerId && !!+MatchEventTypeId) return { PlayerId, MatchEventTypeId };

                return null;
            })

            for (var i = 0; i < MatchEvents.length; i++) {
                if (i !== 0) sql_query += ', ';

                sql_query += ' ($' + (values.length + 1) + ',';
                values.push(MatchEventId);

                sql_query += ' $' + (values.length + 1) + ',';
                values.push(MatchEvents[i].PlayerId);

                sql_query += ' $' + (values.length + 1) + ',';
                values.push(MatchEvents[i].MatchEventTypeId);

                sql_query += ' $' + (values.length + 1) + ')';
                values.push(MatchEvents[i].GoalTypeId);
            }

            result = await pool.query(sql_query, values);
        
            if (result.rowCount === 0) {
                throw new Error('Error inserting / editing match event');
            }
    
        return;
    }

    try {
        var { MatchEventId, MatchEvents, MatchEventTypeId, MatchId, TimeOfGame } = args;

        var pool = await StartPT();

        await insertEditMatchEvent_Query({ pool, MatchEventId, MatchEvents, MatchEventTypeId, MatchId, TimeOfGame });

        await commitTransaction(pool);

        return ({ Response: 1 });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function insertEditMatchRoster(args) {
    async function insertEditMatchRoster_Query({ pool, MatchId, MatchRoster }) {
        var values = [];
        var sql_query = '';

        values = [ MatchId ];
        sql_query = 'DELETE FROM match_roster WHERE matchid = $1';
            
        var result = await pool.query(sql_query, values);

        // Insert New Match Roster
            sql_query = 'INSERT INTO match_roster (matchid, playerid, start, sub, mom, captain) VALUES ';
            values = [];

            for (var i = 0; i < MatchRoster.length; i++) {
                if (i !== 0) sql_query += ', ';

                sql_query += ' ($' + (values.length + 1) + ',';
                values.push(MatchId);

                sql_query += ' $' + (values.length + 1) + ',';
                values.push(MatchRoster[i].PlayerId);

                sql_query += ' $' + (values.length + 1) + ',';
                values.push(MatchRoster[i].Start);

                sql_query += ' $' + (values.length + 1) + ',';
                values.push(MatchRoster[i].Sub);

                sql_query += ' $' + (values.length + 1) + ',';
                values.push(MatchRoster[i].Mom);

                sql_query += ' $' + (values.length + 1) + ')';
                values.push(MatchRoster[i].Captain);
            }

            result = await pool.query(sql_query, values);
        
            if (result.rowCount === 0) {
                throw new Error('Error inserting / editing match roster');
            }
    
        return;
    }

    try {
        var { MatchId, MatchRoster } = args;

        var pool = await StartPT();

        await insertEditMatchRoster_Query({ pool, MatchId, MatchRoster });

        await commitTransaction(pool);

        return ({ Response: 1 });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var matchesController = () => {
    let api = Router();

    api.post('/deleteMatch', authenticate, (req, res) => {
        var MatchId = req.body.MatchId;

        deleteMatch({ MatchId }).then(result => {
            res.send(result);
        })
    });

    api.post('/deleteMatchEvent', authenticate, (req, res) => {
        var MatchEventId = req.body.MatchEventId;

        deleteMatchEvent({ MatchEventId }).then(result => {
            res.send(result);
        })
    });

    api.post('/goaltypes', authenticate, (req, res) => {
        getGoalTypes({}).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditMatch', authenticate, (req, res) => {
        var EventId = req.body.EventId;
        var HomeAway = req.body.HomeAway;
        var LocationId = req.body.LocationId;
        var MatchDate = req.body.MatchDate;
        var MatchId = req.body.MatchId;
        var MatchStatusId = req.body.MatchStatusId;
        var MatchTypeId = req.body.MatchTypeId;
        var OpponentId = req.body.OpponentId;
        var OpponentScore = req.body.OpponentScore;
        var TeamScore = req.body.TeamScore;
        var TrackStarts = req.body.TrackStarts;

        insertEditMatch({ EventId, HomeAway, LocationId, MatchDate, MatchId, MatchStatusId, MatchTypeId, OpponentId, OpponentScore, TeamScore, TrackStarts }).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditMatchEvent', authenticate, (req, res) => {
        var MatchEventId = req.body.MatchEventId;
        var MatchEvents = req.body.MatchEvents;
        var MatchEventTypeId = req.body.MatchEventTypeId;
        var MatchId = req.body.MatchId;
        var TimeOfGame = req.body.TimeOfGame;

        insertEditMatchEvent({ MatchEventId, MatchEvents, MatchEventTypeId, MatchId, TimeOfGame }).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditMatchRoster', authenticate, (req, res) => {
        var MatchId = req.body.MatchId;
        var MatchRoster = req.body.MatchRoster;

        insertEditMatchRoster({ MatchId, MatchRoster }).then(result => {
            res.send(result);
        })
    });

    api.post('/match', authenticate, (req, res) => {
        var MatchId = req.body.MatchId;

        getMatchDetail({ MatchId }).then(result => {
            res.send(result);
        })
    });

    api.post('/matcheventtypes', authenticate, (req, res) => {
        getMatchEventTypes({}).then(result => {
            res.send(result);
        })
    });

    api.post('/matches', authenticate, (req, res) => {
        var CompetitionIds = req.body.CompetitionIds;
        var DateRange = req.body.DateRange;
        var EndDate = req.body.EndDate;
        var EventIds = req.body.EventIds;
        var GetAll = req.body.GetAll;
        var OpponentIds = req.body.OpponentIds;
        var SeasonIds = req.body.SeasonIds;
        var StartDate = req.body.StartDate;
        var TeamIds = req.body.TeamIds;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getMatches({ CompetitionIds, DateRange, EndDate, EventIds, GetAll, OpponentIds, SeasonIds, StartDate, TeamIds, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    api.post('/matchstatuses', authenticate, (req, res) => {
        var GetAll = req.body.GetAll;
        var SearchName = req.body.SearchName;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getMatchStatuses({ GetAll, SearchName, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    api.post('/matchtypes', authenticate, (req, res) => {
        var GetAll = req.body.GetAll;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getMatchTypes({ GetAll, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    return api;
}