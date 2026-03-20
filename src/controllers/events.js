import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { commitTransaction, rollbackTransaction, StartPool, StartPT } from '../../database/database.js';

async function deleteEvent(args) {
    async function deleteEvent_Query({ pool, EventId }) {
        var data = [ EventId ];
        var sql_query = 'DELETE FROM events WHERE id = $1';

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting event');
        }
    
        return;
    }

    try {
        var { EventId } = args;

        var pool = await StartPT();

        await deleteEvent_Query({ pool, EventId });

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

async function getColors() {
    async function getColors_Query({ pool }) {
        var baseQuery = `SELECT id, hexcode FROM colors ORDER BY id ASC`;

        const dataResult = await pool.query(baseQuery);

        var Colors = dataResult.rows;

        return Colors;
    }

    try {
        var pool = await StartPool();

        var Colors = await getColors_Query({ pool });

        return ({ Response: 1, Colors });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getEvents(args) {
    async function getEvents_Query({ pool, GetAll, CompetitionId, PageNo, PageSize, SeasonId, TeamId }) {
        var baseQuery = `
            SELECT E.id eventid, c.id CompetitionId, C.name CompetitionName, T.id TeamId, T.name TeamName, S.id SeasonId, S.name SeasonName, rosterlimit RosterLimit, CONCAT(C.name, ' - ', T.name, ' - ', S.name) EventName, E.color hexcode
            FROM events E
            JOIN competitions C ON C.id = E.competitionid
            JOIN teams T ON T.id = E.teamid
            JOIN seasons S ON S.id = E.seasonid
            WHERE TRUE`;
        let countQuery = `SELECT COUNT(*) FROM events WHERE TRUE`;
        let values = [];
        let countValues = [];

        if (!!+CompetitionId) {
            baseQuery += ' AND E.competitionid = $' + (values.length + 1);
            countQuery += ' AND competitionid = $' + (countValues.length + 1);
            values.push(CompetitionId);
            countValues.push(CompetitionId);
        }

        if (!!+SeasonId) {
            baseQuery += ' AND E.seasonid = $' + (values.length + 1);
            countQuery += ' AND seasonid = $' + (countValues.length + 1);
            values.push(SeasonId);
            countValues.push(SeasonId);
        }

        if (!!+TeamId) {
            baseQuery += ' AND E.teamid = $' + (values.length + 1);
            countQuery += ' AND teamid = $' + (countValues.length + 1);
            values.push(TeamId);
            countValues.push(TeamId);
        }

        baseQuery += ' ORDER BY C.name ASC, T.name ASC, S.name ASC';

        if (!GetAll) {
            const offset = (PageNo - 1) * PageSize;
            baseQuery += ' LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
            values.push(PageSize, offset);
        }

        const dataResult = await pool.query(baseQuery, values);
        const countResult = await pool.query(countQuery, countValues);

        var Events = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;
        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { Events, IsMoreResults, TotalRecords };
    }

    try {
        var { CompetitionId = 0, GetAll = 0, PageNo = 1, PageSize = 10, SeasonId = 0, TeamId = 0 } = args;

        var pool = await StartPool();

        var { Events, IsMoreResults, TotalRecords } = await getEvents_Query({ pool, CompetitionId, GetAll, PageNo, PageSize, SeasonId, TeamId });

        return ({ Response: 1, Events, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function insertEditEvent(args) {
    async function insertEditEvent_Query({ pool, Color, CompetitionId, EventId, RosterLimit, SeasonId, TeamId }) {
        var data = [];
        var sql_query = '';

        if (+EventId) {
            data = [ CompetitionId, TeamId, RosterLimit, SeasonId, Color, new Date(), EventId ];
            sql_query = 'UPDATE events SET competitionid = $1, teamid = $2, rosterlimit = $3, seasonid = $4, color = $5, updated_at = $6 WHERE id = $7 RETURNING *';
        }
        else {
            data = [ CompetitionId, TeamId, RosterLimit, SeasonId, Color ];
            sql_query = 'INSERT INTO events (competitionid, teamid, rosterlimit, seasonid, color) VALUES ($1, $2, $3, $4, $5) RETURNING *';
        }

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error inserting / editing event');
        }
    
        return result.rows[0];
    }

    try {
        var { Color, CompetitionId, EventId, RosterLimit, SeasonId, TeamId } = args;

        var pool = await StartPT();

        var Event = await insertEditEvent_Query({ pool, Color, CompetitionId, EventId, RosterLimit, SeasonId, TeamId });

        await commitTransaction(pool);

        return ({ Response: 1, Event });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var eventsController = () => {
    let api = Router();

    api.post('/colors', authenticate, (req, res) => {
        getColors().then(result => {
            res.send(result);
        })
    });

    api.post('/deleteEvent', authenticate, (req, res) => {
        var EventId = req.body.EventId;

        deleteEvent({ EventId }).then(result => {
            res.send(result);
        })
    });

    api.post('/events', authenticate, (req, res) => {
        var CompetitionId = req.body.CompetitionId;
        var GetAll = req.body.GetAll;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;
        var SeasonId = req.body.SeasonId;
        var TeamId = req.body.TeamId;

        getEvents({ CompetitionId, GetAll, PageNo, PageSize, SeasonId, TeamId }).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditEvent', authenticate, (req, res) => {
        var Color = req.body.Color;
        var CompetitionId = req.body.CompetitionId;
        var EventId = req.body.EventId;
        var RosterLimit = req.body.RosterLimit;
        var SeasonId = req.body.SeasonId;
        var TeamId = req.body.TeamId;

        insertEditEvent({ Color, CompetitionId, EventId, RosterLimit, SeasonId, TeamId }).then(result => {
            res.send(result);
        })
    });

    return api;
}