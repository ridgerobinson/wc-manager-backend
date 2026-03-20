import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { commitTransaction, rollbackTransaction, StartPool, StartPT } from '../../database/database.js';

async function deleteCompetition(args) {
    async function deleteCompetition_Query({ pool, CompetitionId }) {
        var data = [ CompetitionId ];
        var sql_query = 'DELETE FROM competitions WHERE id = $1';

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting competition');
        }
    
        return;
    }

    try {
        var { CompetitionId } = args;

        var pool = await StartPT();

        await deleteCompetition_Query({ pool, CompetitionId });

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

async function getCompetitions(args) {
    async function getCompetitions_Query({ pool, GetAll, SearchName, PageNo, PageSize }) {
        var baseQuery = `SELECT id CompetitionId, name CompetitionName FROM competitions WHERE TRUE`;
        let countQuery = 'SELECT COUNT(*) FROM competitions WHERE TRUE';
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

        var Competitions = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;
        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { Competitions, IsMoreResults, TotalRecords };
    }

    try {
        var { GetAll = 0, SearchName = '', PageNo = 1, PageSize = 10 } = args;

        var pool = await StartPool();

        var { Competitions, IsMoreResults, TotalRecords } = await getCompetitions_Query({ pool, GetAll, SearchName, PageNo, PageSize });

        return ({ Response: 1, Competitions, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function insertEditCompetition(args) {
    async function insertEditCompetition_Query({ pool, CompetitionId, CompetitionName }) {
        var data = [];
        var sql_query = '';

        if (+CompetitionId) {
            data = [ CompetitionName, new Date(), CompetitionId ];
            sql_query = 'UPDATE competitions SET name = $1, updated_at = $2 WHERE id = $3 RETURNING *';
        }
        else {
            data = [ CompetitionName ];
            sql_query = 'INSERT INTO competitions (name) VALUES ($1) RETURNING *';
        }

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error inserting / editing competition');
        }
    
        return result.rows[0];
    }

    try {
        var { CompetitionId, CompetitionName } = args;

        var pool = await StartPT();

        var Competition = await insertEditCompetition_Query({ pool, CompetitionId, CompetitionName });

        await commitTransaction(pool);

        return ({ Response: 1, Competition });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var competitionsController = () => {
    let api = Router();

    api.post('/competitions', authenticate, (req, res) => {
        var GetAll = req.body.GetAll;
        var SearchName = req.body.SearchName;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getCompetitions({ GetAll, SearchName, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    api.post('/deleteCompetition', authenticate, (req, res) => {
        var CompetitionId = req.body.CompetitionId;

        deleteCompetition({ CompetitionId }).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditCompetition', authenticate, (req, res) => {
        var CompetitionId = req.body.CompetitionId;
        var CompetitionName = req.body.CompetitionName;

        insertEditCompetition({ CompetitionId, CompetitionName }).then(result => {
            res.send(result);
        })
    });

    return api;
}