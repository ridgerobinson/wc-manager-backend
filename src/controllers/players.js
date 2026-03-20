import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { commitTransaction, rollbackTransaction, StartPool, StartPT } from '../../database/database.js';

async function deletePlayer(args) {
    async function deletePlayer_Query({ pool, PlayerId }) {
        var data = [ PlayerId ];
        var sql_query = 'DELETE FROM players WHERE id = $1';

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting player');
        }
    
        return;
    }

    try {
        var { PlayerId } = args;

        var pool = await StartPT();

        await deletePlayer_Query({ pool, PlayerId });

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

async function getPlayers(args) {
    try {
        var { GetAll = 0, SearchName = '', PageNo = 1, PageSize = 10 } = args;

        var pool = await StartPool();

        var { Players, IsMoreResults, TotalRecords } = await getPlayers_Query({ pool, GetAll, SearchName, PageNo, PageSize });

        return ({ Response: 1, Players, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getPlayerDetail(args) {
    async function getPlayerDetail_Query({ pool, PlayerId }) {
        var baseQuery = `SELECT id PlayerId, name PlayerName, email PlayerEmail, phone PlayerPhone, position Position FROM players WHERE id = $1`;
        let values = [ PlayerId ];

        const dataResult = await pool.query(baseQuery, values);

        var PlayerDetails = dataResult.rows[0];

        return PlayerDetails;
    }

    async function getPlayerMatchStats_Query({ pool, PlayerId }) {
        var baseQuery = `
            ;WITH PlayerMatchStats AS (
                SELECT ME.matchid, SUM(CASE WHEN MED.matcheventtypeid = 3 THEN 1 ELSE 0 END) Goals, SUM(CASE WHEN MED.matcheventtypeid = 5 THEN 1 ELSE 0 END) Assists
                FROM match_events ME
                JOIN match_events_details MED ON MED.matcheventid = ME.id
                WHERE MED.playerid = $1
                GROUP BY ME.matchid
            )
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
                CASE WHEN (COALESCE(M.matchresult, '') <> '') THEN CASE WHEN (M.teamscore <> 0 AND M.matchstatusid = 2) THEN EXISTS (SELECT 1 FROM match_events ME WHERE ME.matchid = M.id) ELSE TRUE END ELSE FALSE END AS HasStats,
                COALESCE(PMS.Goals, 0) Goals, COALESCE(PMS.Assists, 0) Assists,
                CASE WHEN M.track_starts = 1 THEN CASE WHEN MR.start = 1 THEN 1 ELSE 0 END ELSE NULL END Starter, CASE WHEN M.track_starts = 1 THEN CASE WHEN MR.start = 0 THEN 1 ELSE 0 END ELSE NULL END Sub, MR.captain Captain, MR.mom MOM
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
            JOIN match_roster MR ON MR.matchid = M.id
            LEFT JOIN PlayerMatchStats PMS ON PMS.matchid = M.id
            WHERE MR.playerid = $1
            ORDER BY M.matchdate ASC;
        `;
        let values = [ PlayerId ];

        const dataResult = await pool.query(baseQuery, values);

        var MatchStats = dataResult.rows;

        return MatchStats;
    }

    async function getPlayerOverallStats_Query({ pool, PlayerId }) {
        var sql_query = '';
        var values = [];

        sql_query = `
            ;WITH Matches AS (
                SELECT M.id MatchId
                FROM matches M
                JOIN events E ON E.id = M.eventid
                JOIN match_types MT ON MT.id = M.matchtypeid
                WHERE TRUE
        `;

        // Close Subquery
            sql_query += `
                ),
                MOMCaptains AS (
                    SELECT MR.playerid PlayerId, COUNT(1) GamesPlayed, SUM(CASE WHEN MR.mom = 1 THEN 1 ELSE 0 END) MOMs, SUM(CASE WHEN MR.captain = 1 THEN 1 ELSE 0 END) Captains
                    FROM match_roster MR
                    JOIN Matches M ON M.MatchId = MR.matchid
                    GROUP BY MR.playerid
                ),
                PlayerStats AS (
                    SELECT MED.playerid PlayerId, SUM(CASE WHEN MED.matcheventtypeid = 3 THEN 1 ELSE 0 END) Goals, SUM(CASE WHEN MED.matcheventtypeid = 5 THEN 1 ELSE 0 END) Assists
                    FROM match_events_details MED
                    JOIN match_events ME ON ME.id = MED.matcheventid
                    JOIN Matches M ON M.MatchId = ME.matchid
                    GROUP BY MED.playerid
                )
                SELECT P.id PlayerId, P.name PlayerName, MC.GamesPlayed, MC.MOMs, MC.Captains, COALESCE(PS.Goals, 0) Goals, COALESCE(PS.Assists, 0) Assists, COALESCE(PS.Goals + PS.Assists, 0) GoalContributions, ROUND((COALESCE(PS.Goals + PS.Assists, 0)::DECIMAL / MC.GamesPlayed::DECIMAL), 2) GoalContributionsPG
                FROM players P
                JOIN MOMCaptains MC ON MC.PlayerId = P.id
                LEFT JOIN PlayerStats PS ON PS.PlayerId = P.id
                WHERE P.id = $1
                ORDER BY P.name ASC;
            `;
        
        values.push(PlayerId);

        var result = await pool.query(sql_query, values);

        var PlayerStats = result.rows.map(({ id, gamesplayed, moms, captains, goals, assists, goalcontributions, goalcontributionspergame, ...rest }) => ({ ...rest, gamesplayed: +gamesplayed, moms: +moms, captains: +captains, goals: +goals, assists: +assists, goalcontributions: +goalcontributions, goalcontributionspergame: +goalcontributionspergame }))

        return PlayerStats;
    }

    async function getPlayerTeamStats_Query({ pool, PlayerId }) {
        var sql_query = '';
        var values = [ PlayerId ];

        sql_query = `
            SELECT
                ROW_NUMBER() OVER (ORDER BY GamesPlayed DESC) AS Id,
                GamesPlayed, Wins, Ties, Losses, GoalsFor, GoalsAgainst, GoalDifference,
                ROUND((Wins::DECIMAL / GamesPlayed::DECIMAL) * 100, 2) WinningPercentage,
                ROUND((GoalsFor::DECIMAL / GamesPlayed::DECIMAL), 2) GoalsForPG,
                ROUND((GoalsAgainst::DECIMAL / GamesPlayed::DECIMAL), 2) GoalsAgainstPG,
                ROUND((GoalDifference::DECIMAL / GamesPlayed::DECIMAL), 2) GoalDifferencePG
            FROM (
                SELECT
                    COUNT(1) GamesPlayed,
                    SUM(CASE WHEN teamscore > opponentscore THEN 1 ELSE 0 END) Wins,
                    SUM(CASE WHEN teamscore = opponentscore THEN 1 ELSE 0 END) Ties,
                    SUM(CASE WHEN teamscore < opponentscore THEN 1 ELSE 0 END) Losses,
                    SUM(teamscore) GoalsFor, SUM(opponentscore) GoalsAgainst, SUM(teamscore) - SUM(opponentscore) GoalDifference
                FROM matches M
                JOIN events E ON E.id = M.eventid
                JOIN match_types MT ON MT.id = M.matchtypeid
                JOIN match_roster MR ON MR.matchid = M.id AND MR.playerid = $1
                WHERE TRUE AND COALESCE(M.matchresult, '') <> '' AND MT.levelid <> 7
        `;

        // Close Subquery
            sql_query += `
                ) a;
            `;

        var result = await pool.query(sql_query, values);

        var OverallStats = result.rows;

        return OverallStats;
    }

    try {
        var { PlayerId = 0 } = args;

        var pool = await StartPool();

        var PlayerDetails = await getPlayerDetail_Query({ pool, PlayerId });
        var MatchStats = await getPlayerMatchStats_Query({ pool, PlayerId });
        var OverallStats = await getPlayerOverallStats_Query({ pool, PlayerId });
        var TeamStats = await getPlayerTeamStats_Query({ pool, PlayerId });

        return ({ Response: 1, MatchStats, OverallStats, PlayerDetails, TeamStats });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getPlayers_Query({ pool, GetAll, SearchName, PageNo, PageSize }) {
    var baseQuery = `SELECT id PlayerId, name PlayerName, email PlayerEmail, phone PlayerPhone FROM players WHERE TRUE`;
    let countQuery = 'SELECT COUNT(*) FROM players WHERE TRUE';
    let values = [];
    let countValues = [];

    if (SearchName !== '') {
        baseQuery += ' AND LOWER(name) LIKE LOWER($' + (values.length + 1) + ')';
        countQuery += ' AND LOWER(name) LIKE LOWER($' + (countValues.length + 1) + ')';
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

    var Players = dataResult.rows;

    var TotalRecords = +countResult.rows[0].count;
    var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

    return { Players, IsMoreResults, TotalRecords };
}

async function insertEditPlayer(args) {
    async function insertEditPlayer_Query({ pool, PlayerEmail, PlayerId, PlayerName, PlayerPhone }) {
        var data = [];
        var sql_query = '';

        if (+PlayerId) {
            data = [ PlayerEmail, PlayerName, PlayerPhone, new Date(), PlayerId ];
            sql_query = 'UPDATE players SET email = $1, name = $2, phone = $3, updated_at = $4 WHERE id = $5 RETURNING *';
        }
        else {
            data = [ PlayerEmail, PlayerName, PlayerPhone ];
            sql_query = 'INSERT INTO players (email, name, phone) VALUES ($1, $2, $3) RETURNING *';
        }

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error inserting / editing player');
        }
    
        return result.rows[0];
    }

    try {
        var { PlayerEmail, PlayerId, PlayerName, PlayerPhone, SkipCheck = 0 } = args;

        var pool = await StartPT();

        var MatchingPlayer = 0;

        if (!SkipCheck) {
            var { TotalRecords } = await getPlayers_Query({ pool, GetAll: 1, SearchName: PlayerName });
            if (+TotalRecords > 0) return ({ Response: 1, MatchingPlayer: 1 });
        }

        var Player = await insertEditPlayer_Query({ pool, PlayerEmail, PlayerId, PlayerName, PlayerPhone });

        await commitTransaction(pool);

        return ({ Response: 1, MatchingPlayer, Player });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var playersController = () => {
    let api = Router();

    api.post('/deletePlayer', authenticate, (req, res) => {
        var PlayerId = req.body.PlayerId;

        deletePlayer({ PlayerId }).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditPlayer', authenticate, (req, res) => {
        var PlayerEmail = req.body.PlayerEmail;
        var PlayerId = req.body.PlayerId;
        var PlayerName = req.body.PlayerName;
        var PlayerPhone = req.body.PlayerPhone;
        var SkipCheck = req.body.SkipCheck;

        insertEditPlayer({ PlayerEmail, PlayerId, PlayerName, PlayerPhone, SkipCheck }).then(result => {
            res.send(result);
        })
    });

    api.post('/player', authenticate, (req, res) => {
        var PlayerId = req.body.PlayerId;

        getPlayerDetail({ PlayerId }).then(result => {
            res.send(result);
        })
    });

    api.post('/players', authenticate, (req, res) => {
        var GetAll = req.body.GetAll;
        var SearchName = req.body.SearchName;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getPlayers({ GetAll, SearchName, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    return api;
}