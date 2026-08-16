<?php

declare(strict_types=1);

namespace Bga\Games\Scoop\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\Scoop\Game;

class EndRound extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 95,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    public function onEnteringState(): string
    {
        $this->game->scoreRound();
        $this->gamestate->setAllPlayersMultiactive();

        foreach (array_keys($this->game->loadPlayersBasicInfos()) as $playerId) {
            $this->game->giveExtraTime((int) $playerId);
        }

        return RoundEndConfirm::class;
    }
}
