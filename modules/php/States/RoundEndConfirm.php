<?php

declare(strict_types=1);

namespace Bga\Games\Scoop\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\Scoop\Game;

/**
 * All players review remaining cards (face-down now revealed) and ready up
 * before the next round is dealt.
 */
class RoundEndConfirm extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 96,
            type: StateType::MULTIPLE_ACTIVE_PLAYER,
            description: clienttranslate('Other players must ready up for the next round'),
            descriptionMyTurn: clienttranslate('${you} must ready up for the next round'),
        );
    }

    public function getArgs(): array
    {
        $data = $this->game->getRoundRevealData();
        $active = array_map('intval', $this->gamestate->getActivePlayerList());
        $all = array_map('intval', array_keys($this->game->loadPlayersBasicInfos()));
        $data['readyPlayerIds'] = array_values(array_diff($all, $active));

        return $data;
    }

    #[PossibleAction]
    public function actReady(int $currentPlayerId)
    {
        $this->bga->notify->all('playerReady', clienttranslate('${player_name} is ready'), [
            'player_id' => $currentPlayerId,
        ]);

        $this->gamestate->setPlayerNonMultiactive(
            $currentPlayerId,
            fn () => $this->game->advanceAfterRoundConfirm()
        );
    }

    public function zombie(int $playerId)
    {
        return $this->actReady($playerId);
    }
}
