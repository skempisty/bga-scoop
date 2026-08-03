<?php

declare(strict_types=1);

namespace Bga\Games\Scoop\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\Actions\Types\IntArrayParam;
use Bga\GameFramework\UserException;
use Bga\Games\Scoop\Cards;
use Bga\Games\Scoop\Game;

/**
 * After a legal face-down play, optionally add matching hand/face-up cards.
 */
class AddMatching extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            // Keep well clear of globals 10–13 (round_number, starter, etc.)
            id: 20,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may add matching cards'),
            descriptionMyTurn: clienttranslate('${you} may add matching cards or continue'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int) $this->game->getActivePlayerId();
        $info = $this->game->getMatchingAddInfo($playerId);

        return [
            'revealedRank' => $info['rank'] !== '' ? $info['rank'] : '?',
            'matchableCardIds' => $info['cardIds'],
            'matchableCards' => $info['cards'],
            'maxAdd' => $info['maxAdd'],
            'middleTopCount' => $info['topCount'],
            'inFinalTurns' => (int) $this->game->getGameStateValue('in_final_turns') === 1,
            'round' => (int) $this->game->getGameStateValue('round_number'),
            'numRounds' => $this->game->getPlayersNumber(),
        ];
    }

    /**
     * @param int[] $card_ids
     */
    #[PossibleAction]
    public function actAddMatching(
        #[IntArrayParam(min: 1, max: 3)] array $card_ids,
        int $activePlayerId,
        array $args,
    ) {
        $info = $this->game->getMatchingAddInfo($activePlayerId);
        if ($info['maxAdd'] < 1) {
            throw new UserException(clienttranslate('You cannot add any more matching cards'));
        }

        $card_ids = array_values(array_unique(array_map('intval', $card_ids)));
        if (count($card_ids) > $info['maxAdd']) {
            throw new UserException(clienttranslate('You cannot play more than four of the same rank on the pile'));
        }

        $allowed = array_flip($info['cardIds']);
        $cards = [];
        foreach ($card_ids as $cardId) {
            if (!isset($allowed[$cardId])) {
                throw new UserException(clienttranslate('Those cards must match the revealed rank'));
            }
            $card = $this->game->getCardFromPlayerSources($activePlayerId, $cardId);
            if ($card === null || Cards::cardRank($card) !== $info['rank']) {
                throw new UserException(clienttranslate('Invalid matching card selection'));
            }
            $cards[] = $card;
        }

        $topGroupBefore = Cards::getTopGroup($this->game->getMiddleCards());
        $this->game->moveCardsToMiddle($cards);

        $result = $this->game->finalizePlay($activePlayerId, $cards, $topGroupBefore);

        if ($result['stay']) {
            return PlayerTurn::class;
        }

        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actDoneMatching(int $activePlayerId)
    {
        if ($this->game->playerHasNoCards($activePlayerId)) {
            $this->game->handlePlayerWentOut($activePlayerId);
        }

        return NextPlayer::class;
    }

    public function zombie(int $playerId)
    {
        return $this->actDoneMatching($playerId);
    }
}
