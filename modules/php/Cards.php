<?php

declare(strict_types=1);

namespace Bga\Games\Scoop;

class Cards
{
    public const HAND_SIZE = 19;
    public const TABLE_SLOTS = 4;

    public const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    public const SUITS = ['spade', 'heart', 'diamond', 'club'];

    /** Rank strength: higher is stronger. */
    private const STRENGTH = [
        'A' => 1,
        '2' => 2,
        '3' => 3,
        '4' => 4,
        '5' => 5,
        '6' => 6,
        '7' => 7,
        '8' => 8,
        '9' => 9,
        'J' => 10,
        'Q' => 11,
        'K' => 12,
        '10' => 13,
    ];

    private const POINTS = [
        'A' => 1,
        '2' => 2,
        '3' => 3,
        '4' => 4,
        '5' => 5,
        '6' => 6,
        '7' => 7,
        '8' => 8,
        '9' => 9,
        'J' => 10,
        'Q' => 10,
        'K' => 10,
        '10' => 20,
    ];

    public static function rankStrength(string $rank): int
    {
        return self::STRENGTH[$rank];
    }

    public static function rankPoints(string $rank): int
    {
        return self::POINTS[$rank];
    }

    public static function cardRank(array $card): string
    {
        return $card['type'];
    }

    public static function cardDeckIndex(array $card): int
    {
        return intdiv((int) $card['type_arg'], 4);
    }

    public static function cardSuitIndex(array $card): int
    {
        return (int) $card['type_arg'] % 4;
    }

    public static function encodeTypeArg(int $deckIndex, int $suitIndex): int
    {
        return $deckIndex * 4 + $suitIndex;
    }

    public static function slotArg(int $playerId, int $slot): int
    {
        return $playerId * 10 + $slot;
    }

    public static function parseSlotArg(int $locationArg): array
    {
        return [
            'player_id' => intdiv($locationArg, 10),
            'slot' => $locationArg % 10,
        ];
    }

    public static function compareCard(array $a, array $b): int
    {
        $diff = self::rankStrength(self::cardRank($b)) - self::rankStrength(self::cardRank($a));
        if ($diff !== 0) {
            return $diff;
        }

        return (int) $a['id'] - (int) $b['id'];
    }

    public static function sortByRank(array $cards): array
    {
        usort($cards, [self::class, 'compareCard']);

        return $cards;
    }

    /**
     * @return int[] cards per source deck for one player
     */
    public static function balancedDealSplit(int $handSize, int $deckCount, int $playerIndex): array
    {
        $base = intdiv($handSize, $deckCount);
        $remainder = $handSize % $deckCount;
        $split = array_fill(0, $deckCount, $base);

        for ($i = 0; $i < $remainder; $i++) {
            $deckIdx = ($playerIndex + $i) % $deckCount;
            $split[$deckIdx]++;
        }

        return $split;
    }

    public static function canPlayRankOnMiddle(string $rank, ?string $topRank, bool $middleEmpty): bool
    {
        if ($middleEmpty) {
            return true;
        }

        if ($rank === '10') {
            return true;
        }

        if ($topRank === null) {
            return true;
        }

        return self::rankStrength($rank) <= self::rankStrength($topRank);
    }

    /**
     * @param array<int, array> $middleCards ordered bottom to top
     * @return array{rank: ?string, count: int}
     */
    public static function getTopGroup(array $middleCards): array
    {
        if ($middleCards === []) {
            return ['rank' => null, 'count' => 0];
        }

        $top = end($middleCards);
        $rank = self::cardRank($top);
        $count = 0;

        for ($i = count($middleCards) - 1; $i >= 0; $i--) {
            if (self::cardRank($middleCards[$i]) !== $rank) {
                break;
            }
            $count++;
        }

        return ['rank' => $rank, 'count' => $count];
    }

    public static function maxPlayCountWithoutOverComplete(int $topGroupCount, int $available): int
    {
        if ($topGroupCount === 0) {
            return min(4, $available);
        }

        return min($available, 4 - $topGroupCount);
    }

    public static function causesScoop(string $rank, int $playCount, int $topGroupCount): bool
    {
        if ($rank === '10') {
            return true;
        }

        if ($topGroupCount > 0) {
            return $topGroupCount + $playCount === 4;
        }

        return $playCount === 4;
    }

    public static function formatCardLabel(array $card): string
    {
        $suitSymbols = ['♠', '♥', '♦', '♣'];
        $rank = self::cardRank($card);
        $suit = $suitSymbols[self::cardSuitIndex($card)];

        return $rank . $suit;
    }

    public static function scoreCards(array $cards): int
    {
        $total = 0;
        foreach ($cards as $card) {
            $total += self::rankPoints(self::cardRank($card));
        }

        return $total;
    }
}
