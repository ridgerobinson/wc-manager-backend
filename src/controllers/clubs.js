import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { commitTransaction, rollbackTransaction, StartPool, StartPT } from '../../database/database.js';

import AppDataSource from '../../ormconfig.js';

async function deleteClub(args) {
    async function deleteClub_Query({ pool, ClubId }) {
        var data = [ ClubId ];
        var sql_query = 'DELETE FROM clubs WHERE id = $1';

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error deleting club');
        }
    
        return;
    }

    try {
        var { ClubId } = args;

        var pool = await StartPT();

        await deleteClub_Query({ pool, ClubId });

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

async function getClubs(args) {
    async function getClubs_Query({ pool, GetAll, MyClub, SearchName, PageNo, PageSize }) {
        var baseQuery = `SELECT id ClubId, name ClubName, myclub MyClub FROM clubs WHERE TRUE`;
        let countQuery = 'SELECT COUNT(*) FROM clubs WHERE TRUE';
        let values = [];
        let countValues = [];

        if (+MyClub === 1) {
            baseQuery += ' AND myclub = 1';
            countQuery += ' AND myclub = 1';
        }

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

        var Clubs = dataResult.rows;

        var TotalRecords = +countResult.rows[0].count;
        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { Clubs, IsMoreResults, TotalRecords };
    }

    try {
        var { GetAll = 0, MyClub = 0, SearchName = '', PageNo = 1, PageSize = 10 } = args;

        var pool = await StartPool();

        var { Clubs, IsMoreResults, TotalRecords } = await getClubs_Query({ pool, GetAll, MyClub, SearchName, PageNo, PageSize });

        return ({ Response: 1, Clubs, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function getClubs_Orm(args) {
    async function getClubs_Query({ MyClub, SearchName, PageNo, PageSize }) {
        const clubRepository = AppDataSource.getRepository('Club');
    
        const query = clubRepository.createQueryBuilder('club');

        if (+MyClub === 1) query.andWhere('club.myclub = 1');
        if (SearchName) query.andWhere('club.clubname ILIKE :clubname', { clubname: `%${SearchName}%` });

        const [Clubs, TotalRecords] = await query
        .skip((PageNo - 1) * PageSize)
        .take(PageSize)
        .getManyAndCount();

        var IsMoreResults = (PageSize * PageNo) < TotalRecords ? 1 : 0;

        return { Clubs, IsMoreResults, TotalRecords };
    }

    try {
        var { MyClub = 0, SearchName = '', PageNo = 1, PageSize = 10 } = args;

        var { Clubs, IsMoreResults, TotalRecords } = await getClubs_Query({ MyClub, SearchName, PageNo, PageSize });

        return ({ Response: 1, Clubs, IsMoreResults, TotalRecords });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    }
}

async function insertEditClub(args) {
    async function insertEditClub_Query({ pool, ClubId, ClubName }) {
        var data = [];
        var sql_query = '';

        if (+ClubId) {
            data = [ ClubName, new Date(), ClubId ];
            sql_query = 'UPDATE clubs SET name = $1, updated_at = $2 WHERE id = $3 RETURNING *';
        }
        else {
            data = [ ClubName ];
            sql_query = 'INSERT INTO clubs (name, myclub) VALUES ($1, 0) RETURNING *';
        }

        var result = await pool.query(sql_query, data);
    
        if (result.rowCount === 0) {
            throw new Error('Error inserting / editing club');
        }
    
        return result.rows[0];
    }

    try {
        var { ClubId, ClubName } = args;

        var pool = await StartPT();

        var Club = await insertEditClub_Query({ pool, ClubId, ClubName });

        await commitTransaction(pool);

        return ({ Response: 1, Club });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var clubsController = () => {
    let api = Router();

    api.post('/clubs', authenticate, (req, res) => {
        var GetAll = req.body.GetAll;
        var MyClub = req.body.MyClub;
        var SearchName = req.body.SearchName;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getClubs({ GetAll, MyClub, SearchName, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    api.post('/clubs_orm', authenticate, (req, res) => {
        var MyClub = req.body.MyClub;
        var SearchName = req.body.SearchName;
        var PageNo = req.body.PageNo;
        var PageSize = req.body.PageSize;

        getClubs_Orm({ MyClub, SearchName, PageNo, PageSize }).then(result => {
            res.send(result);
        })
    });

    api.post('/deleteClub', authenticate, (req, res) => {
        var ClubId = req.body.ClubId;

        deleteClub({ ClubId }).then(result => {
            res.send(result);
        })
    });

    api.post('/insertEditClub', authenticate, (req, res) => {
        var ClubId = req.body.ClubId;
        var ClubName = req.body.ClubName;

        insertEditClub({ ClubId, ClubName }).then(result => {
            res.send(result);
        })
    });

    return api;
}