import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { commitTransaction, rollbackTransaction, StartPool, StartPT } from '../../database/database.js';

async function deleteTeam(args) {
    async function deleteTeam_Query({ pool, TeamId }) {
        var data = [ TeamId ];
        var sql_query = 'DELETE FROM teams WHERE id = $1';

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting team');
        }
    
        return;
    }

    try {
        var { TeamId } = args;

        var pool = await StartPT();

        await deleteTeam_Query({ pool, TeamId });

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

async function getTeams(args) {
    async function getTeams_Query({ pool, GetAll, MyClub, SearchName, PageNo, PageSize }) {
        var baseQuery = `SELECT T.id TeamId, T.name TeamName, c.Id ClubId, c.name ClubName FROM teams T JOIN clubs C ON C.id = T.clubid WHERE TRUE`;
        let countQuery = 'SELECT COUNT(*) FROM teams T JOIN clubs C ON C.id = T.clubid WHERE TRUE';
        let values = [];
        let countValues = [];

        if (+MyClub === 1) {
            baseQuery += ' AND c.myclub = 1';
            countQuery += ' AND c.myclub = 1';
        }

        if (SearchName !== '') {
            baseQuery += ' AND t.name LIKE $' + (values.length + 1);
            countQuery += ' AND t.name LIKE $' + (countValues.length + 1);
            values.push(`%${SearchName}%`);
            countValues.push(`%${SearchName}%`);
        }

        baseQuery += ' ORDER BY t.name ASC';

        if (!GetAll) {
            const offset = (PageNo - 1) * PageSize;
            baseQuery += ' LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
            values.push(PageSize, offset);
        }

        const dataResult = await pool.query(baseQuery, values);
        const countResult = await pool.query(countQuery, countValues);

        var Teams = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;
        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { Teams, IsMoreResults, TotalRecords };
    }

    try {
        var { GetAll = 0, MyClub = 0, SearchName = '', PageNo = 1, PageSize = 10 } = args;

        var pool = await StartPool();

        var { Teams, IsMoreResults, TotalRecords } = await getTeams_Query({ pool, GetAll, MyClub, SearchName, PageNo, PageSize });

        return ({ Response: 1, Teams, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function insertEditTeam(args) {
    async function insertEditTeam_Query({ pool, ClubId, TeamId, TeamName }) {
        var data = [];
        var sql_query = '';

        if (+TeamId) {
            data = [ TeamName, ClubId, new Date(), TeamId ];
            sql_query = 'UPDATE teams SET name = $1, clubid = $2, updated_at = $3 WHERE id = $4 RETURNING *';
        }
        else {
            data = [ TeamName, ClubId ];
            sql_query = 'INSERT INTO teams (name, clubid) VALUES ($1, $2) RETURNING *';
        }

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error inserting / editing team');
        }
    
        return result.rows[0];
    }

    try {
        var { ClubId, TeamId, TeamName } = args;

        var pool = await StartPT();

        var Team = await insertEditTeam_Query({ pool, ClubId, TeamId, TeamName });

        await commitTransaction(pool);

        return ({ Response: 1, Team });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var teamsController = () => {
    let api = Router();

    api.post('/teams', authenticate, (req, res) => {
        var GetAll = req.body.GetAll;
        var MyClub = req.body.MyClub;
        var SearchName = req.body.SearchName;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getTeams({ GetAll, MyClub, SearchName, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    api.post('/deleteTeam', authenticate, (req, res) => {
        var TeamId = req.body.TeamId;

        deleteTeam({ TeamId }).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditTeam', authenticate, (req, res) => {
        var ClubId = req.body.ClubId;
        var TeamId = req.body.TeamId;
        var TeamName = req.body.TeamName;

        insertEditTeam({ ClubId, TeamId, TeamName }).then(result => {
            res.send(result);
        })
    });

    return api;
}