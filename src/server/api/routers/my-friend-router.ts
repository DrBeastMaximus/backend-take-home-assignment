import type { Database } from '@/server/db'

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { protectedProcedure } from '@/server/trpc/procedures'
import { router } from '@/server/trpc/router'
import {
  IdSchema,
} from '@/utils/server/base-schemas'

export const myFriendRouter = router({
  getById: protectedProcedure
    .input(
      z.object({
        friendUserId: IdSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const mutualFriendCount = await countMutualFriend(ctx.db, ctx.session.userId, input.friendUserId)

      const result = await ctx.db
        .selectFrom('users as friends')
        .innerJoin('friendships', 'friendships.friendUserId', 'friends.id')
        .innerJoin(
          userTotalFriendCount(ctx.db).as('userTotalFriendCount'),
          'userTotalFriendCount.userId',
          'friends.id'
        )
        .where('friendships.userId', '=', ctx.session.userId)
        .where('friendships.friendUserId', '=', input.friendUserId)
        .where(
          'friendships.status',
          '=',
          FriendshipStatusSchema.Values['accepted']
        )
        .select([
          'friends.id',
          'friends.fullName',
          'friends.phoneNumber',
          'totalFriendCount',
        ])
        .executeTakeFirstOrThrow(() => new TRPCError({ code: 'NOT_FOUND' }))
        .then(
          (res) => ({
            ...res,
            mutualFriendCount,
          })
        )

      return result
    }),
})

// ---- Original Code ------
// export const myFriendRouter = router({
//   getById: protectedProcedure
//     .input(
//       z.object({
//         friendUserId: IdSchema,
//       })
//     )
//     .mutation(async ({ ctx, input }) => {
//       return ctx.db.connection().execute(async (conn) =>
//         /**
//          * Question 4: Implement mutual friend count
//          *
//          * Add `mutualFriendCount` to the returned result of this query. You can
//          * either:
//          *  (1) Make a separate query to count the number of mutual friends,
//          *  then combine the result with the result of this query
//          *  (2) BONUS: Use a subquery (hint: take a look at how
//          *  `totalFriendCount` is implemented)
//          *
//          * Instructions:
//          *  - Go to src/server/tests/friendship-request.test.ts, enable the test
//          * scenario for Question 3
//          *  - Run `yarn test` to verify your answer
//          *
//          * Documentation references:
//          *  - https://kysely-org.github.io/kysely/classes/SelectQueryBuilder.html#innerJoin
//          */
//         conn
//           .selectFrom('users as friends')
//           .innerJoin('friendships', 'friendships.friendUserId', 'friends.id')
//           .innerJoin(
//             userTotalFriendCount(conn).as('userTotalFriendCount'),
//             'userTotalFriendCount.userId',
//             'friends.id'
//           )
//           .where('friendships.userId', '=', ctx.session.userId)
//           .where('friendships.friendUserId', '=', input.friendUserId)
//           .where(
//             'friendships.status',
//             '=',
//             FriendshipStatusSchema.Values['accepted']
//           )
//           .select([
//             'friends.id',
//             'friends.fullName',
//             'friends.phoneNumber',
//             'totalFriendCount',
//           ])
//           .executeTakeFirstOrThrow(() => new TRPCError({ code: 'NOT_FOUND' }))
//           .then(
//             z.object({
//               id: IdSchema,
//               fullName: NonEmptyStringSchema,
//               phoneNumber: NonEmptyStringSchema,
//               totalFriendCount: CountSchema,
//               mutualFriendCount: CountSchema,
//             }).parse
//           )
//       )
//     }),
// })
// ---- Original Code ------

const countMutualFriend = async (db: Database, userA: number, userB: number) => {
  const userAFriends = await db
    .selectFrom('friendships')
    .where('friendships.userId', '=', userA)
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select('friendships.friendUserId')
    .execute()

  const userBFriends = await db
    .selectFrom('friendships')
    .where('friendships.userId', '=', userB)
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select('friendships.friendUserId')
    .execute()

  const mutualFriends = userAFriends.filter(({ friendUserId }) =>
    userBFriends.some(({ friendUserId: fId }) => fId === friendUserId)
  )

  return mutualFriends.length;
}

const userTotalFriendCount = (db: Database) => {
  return db
    .selectFrom('friendships')
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select((eb) => [
      'friendships.userId',
      eb.fn.count('friendships.friendUserId').as('totalFriendCount'),
    ])
    .groupBy('friendships.userId')
}