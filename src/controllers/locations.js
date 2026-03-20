import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { commitTransaction, rollbackTransaction, StartPool, StartPT } from '../../database/database.js';

async function deleteLocation(args) {
    async function deleteLocation_Query({ pool, LocationId }) {
        var data = [ LocationId ];
        var sql_query = 'DELETE FROM locations WHERE id = $1';

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting location');
        }
    
        return;
    }

    try {
        var { LocationId } = args;

        var pool = await StartPT();

        await deleteLocation_Query({ pool, LocationId });

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

async function getLocations(args) {
    async function getLocations_Query({ pool, GetAll, SearchName, PageNo, PageSize }) {
        var baseQuery = `SELECT id LocationId, name LocationName FROM locations WHERE TRUE`;
        let countQuery = 'SELECT COUNT(*) FROM locations WHERE TRUE';
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

        var Locations = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;
        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { Locations, IsMoreResults, TotalRecords };
    }

    try {
        var { GetAll = 0, SearchName = '', PageNo = 1, PageSize = 10 } = args;

        var pool = await StartPool();

        var { Locations, IsMoreResults, TotalRecords } = await getLocations_Query({ pool, GetAll, SearchName, PageNo, PageSize });

        return ({ Response: 1, Locations, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function insertEditLocation(args) {
    async function insertEditLocation_Query({ pool, LocationId, LocationName }) {
        var data = [];
        var sql_query = '';

        if (+LocationId) {
            data = [ LocationName, new Date(), LocationId ];
            sql_query = 'UPDATE locations SET name = $1, updated_at = $2 WHERE id = $3 RETURNING *';
        }
        else {
            data = [ LocationName ];
            sql_query = 'INSERT INTO locations (name) VALUES ($1) RETURNING *';
        }

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error inserting / editing location');
        }
    
        return result.rows[0];
    }

    try {
        var { LocationId, LocationName } = args;

        var pool = await StartPT();

        var Location = await insertEditLocation_Query({ pool, LocationId, LocationName });

        await commitTransaction(pool);

        return ({ Response: 1, Location });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var locationsController = () => {
    let api = Router();

    api.post('/deleteLocation', authenticate, (req, res) => {
        var LocationId = req.body.LocationId;

        deleteLocation({ LocationId }).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditLocation', authenticate, (req, res) => {
        var LocationId = req.body.LocationId;
        var LocationName = req.body.LocationName;

        insertEditLocation({ LocationId, LocationName }).then(result => {
            res.send(result);
        })
    });

    api.post('/locations', authenticate, (req, res) => {
        var GetAll = req.body.GetAll;
        var SearchName = req.body.SearchName;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getLocations({ GetAll, SearchName, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    return api;
}