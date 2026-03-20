import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { commitTransaction, rollbackTransaction, StartPool, StartPT } from '../../database/database.js';

async function deleteSeason(args) {
    async function deleteSeason_Query({ pool, SeasonId }) {
        var data = [ SeasonId ];
        var sql_query = 'DELETE FROM seasons WHERE id = $1';

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting season');
        }
    
        return;
    }

    try {
        var { SeasonId } = args;

        var pool = await StartPT();

        await deleteSeason_Query({ pool, SeasonId });

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

async function getSeasons(args) {
    async function getSeasons_Query({ pool, GetAll, SearchName, PageNo, PageSize }) {
        var baseQuery = `SELECT id SeasonId, name SeasonName FROM seasons WHERE TRUE`;
        let countQuery = 'SELECT COUNT(*) FROM seasons WHERE TRUE';
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

        var Seasons = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;
        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { Seasons, IsMoreResults, TotalRecords };
    }

    try {
        var { GetAll = 0, SearchName = '', PageNo = 1, PageSize = 10 } = args;

        var pool = await StartPool();

        var { Seasons, IsMoreResults, TotalRecords } = await getSeasons_Query({ pool, GetAll, SearchName, PageNo, PageSize });

        return ({ Response: 1, Seasons, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function insertEditSeason(args) {
    async function insertEditSeason_Query({ pool, SeasonId, SeasonName }) {
        var data = [];
        var sql_query = '';

        if (+SeasonId) {
            data = [ SeasonName, new Date(), SeasonId ];
            sql_query = 'UPDATE seasons SET name = $1, updated_at = $2 WHERE id = $3 RETURNING *';
        }
        else {
            data = [ SeasonName ];
            sql_query = 'INSERT INTO seasons (name) VALUES ($1) RETURNING *';
        }

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error inserting / editing season');
        }
    
        return result.rows[0];
    }

    try {
        var { SeasonId, SeasonName } = args;

        var pool = await StartPT();

        var Season = await insertEditSeason_Query({ pool, SeasonId, SeasonName });

        await commitTransaction(pool);

        return ({ Response: 1, Season });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var seasonsController = () => {
    let api = Router();

    api.post('/deleteSeason', authenticate, (req, res) => {
        var SeasonId = req.body.SeasonId;

        deleteSeason({ SeasonId }).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditSeason', authenticate, (req, res) => {
        var SeasonId = req.body.SeasonId;
        var SeasonName = req.body.SeasonName;

        insertEditSeason({ SeasonId, SeasonName }).then(result => {
            res.send(result);
        })
    });

    api.post('/seasons', authenticate, (req, res) => {
        var GetAll = req.body.GetAll;
        var SearchName = req.body.SearchName;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getSeasons({ GetAll, SearchName, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    return api;
}