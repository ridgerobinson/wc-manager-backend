import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { StartPool } from '../../database/database.js';

async function getOverallStats(args) {
    async function getOverallStats_Query({ pool, CompetitionIds, EndDate, EventIds, HideFriendlies, OpponentIds, SeasonIds, StartDate, TeamIds }) {
        var sql_query = '';
        var values = [];

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
                WHERE TRUE AND COALESCE(M.matchresult, '') <> ''
        `;

        // Add Filtered Data
            if (!!HideFriendlies) {
                sql_query += ' AND MT.levelid <> 7'
            }

            if (!!StartDate && !!EndDate) {
                sql_query += ' AND CAST(M.matchdate AS DATE) BETWEEN CAST($' + (values.length + 1) + ' AS DATE) AND CAST($' + (values.length + 2) + ' AS DATE)';
                values.push(StartDate);
                values.push(EndDate);
            }

            if (CompetitionIds.length > 0) {
                sql_query += ' AND E.competitionid = ANY($' + (values.length + 1) + '::int[])';
                values.push(CompetitionIds);
            }

            if (EventIds.length > 0) {
                sql_query += ' AND E.id = ANY($' + (values.length + 1) + '::int[])';
                values.push(EventIds);
            }

            if (SeasonIds.length > 0) {
                sql_query += ' AND E.seasonid = ANY($' + (values.length + 1) + '::int[])';
                values.push(SeasonIds);
            }

            if (OpponentIds.length > 0) {
                sql_query += ' AND M.opponentid = ANY($' + (values.length + 1) + '::int[])';
                values.push(OpponentIds);
            }
    
            if (TeamIds.length > 0) {
                sql_query += ' AND E.teamid = ANY($' + (values.length + 1) + '::int[])';
                values.push(TeamIds);
            }

        // Close Subquery
            sql_query += `
                ) a;
            `;

        var result = await pool.query(sql_query, values);

        var OverallStats = result.rows;

        return OverallStats;
    }

    async function getPlayerStats_Query({ pool, CompetitionIds, EndDate, EventIds, HideFriendlies, OpponentIds, SeasonIds, StartDate, TeamIds }) {
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

        // Add Filtered Data
            if (!!StartDate && !!EndDate) {
                sql_query += ' AND CAST(M.matchdate AS DATE) BETWEEN CAST($' + (values.length + 1) + ' AS DATE) AND CAST($' + (values.length + 2) + ' AS DATE)';
                values.push(StartDate);
                values.push(EndDate);
            }

            if (!!HideFriendlies) {
                sql_query += ' AND MT.levelid <> 7'
            }

            if (CompetitionIds.length > 0) {
                sql_query += ' AND E.competitionid = ANY($' + (values.length + 1) + '::int[])';
                values.push(CompetitionIds);
            }

            if (EventIds.length > 0) {
                sql_query += ' AND E.id = ANY($' + (values.length + 1) + '::int[])';
                values.push(EventIds);
            }

            if (SeasonIds.length > 0) {
                sql_query += ' AND E.seasonid = ANY($' + (values.length + 1) + '::int[])';
                values.push(SeasonIds);
            }

            if (OpponentIds.length > 0) {
                sql_query += ' AND M.opponentid = ANY($' + (values.length + 1) + '::int[])';
                values.push(OpponentIds);
            }
    
            if (TeamIds.length > 0) {
                sql_query += ' AND E.teamid = ANY($' + (values.length + 1) + '::int[])';
                values.push(TeamIds);
            }

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
                ORDER BY P.name ASC;
            `;

        var result = await pool.query(sql_query, values);

        var PlayerStats = result.rows.map(({ id, gamesplayed, moms, captains, goals, assists, goalcontributions, goalcontributionspergame, ...rest }) => ({ ...rest, gamesplayed: +gamesplayed, moms: +moms, captains: +captains, goals: +goals, assists: +assists, goalcontributions: +goalcontributions, goalcontributionspergame: +goalcontributionspergame }))

        return PlayerStats;
    }

    try {
        var { CompetitionIds = '', EndDate = '', EventIds = '', HideFriendlies = 0, OpponentIds = '', SeasonIds = '', StartDate = '', TeamIds = '' } = args;

        var pool = await StartPool();

        var OverallStats = await getOverallStats_Query({ pool, CompetitionIds, EndDate, EventIds, HideFriendlies, OpponentIds, SeasonIds, StartDate, TeamIds });
        var PlayerStats = await getPlayerStats_Query({ pool, CompetitionIds, EndDate, EventIds, HideFriendlies, OpponentIds, SeasonIds, StartDate, TeamIds });

        return ({ Response: 1, OverallStats, PlayerStats });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var statsController = () => {
    let api = Router();

    api.post('/overallStats', authenticate, (req, res) => {
        var CompetitionIds = req.body.CompetitionIds;
        var EndDate = req.body.EndDate;
        var EventIds = req.body.EventIds;
        var HideFriendlies = +req.body.HideFriendlies;
        var OpponentIds = req.body.OpponentIds;
        var SeasonIds = req.body.SeasonIds;
        var StartDate = req.body.StartDate;
        var TeamIds = req.body.TeamIds;

        getOverallStats({ CompetitionIds, EndDate, EventIds, HideFriendlies, OpponentIds, SeasonIds, StartDate, TeamIds }).then(result => {
            res.send(result);
        })
    });

    return api;
}