import { EntitySchema } from 'typeorm';

export default new EntitySchema({
  name: 'Club_orm',
  tableName: 'clubs_orm',
  columns: {
    clubid: {
      type: 'int',
      primary: true,
      generated: true,
    },
    clubname: {
      type: 'varchar',
    },
    myclub: {
        type: 'integer'
    },
    created_at: {
      type: 'timestamp',
      createDate: true,
      default: () => 'CURRENT_TIMESTAMP',
    },
  },
});