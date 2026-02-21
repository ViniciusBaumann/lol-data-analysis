from django.db import models


class League(models.Model):
    """Torneio ou liga de eSports de League of Legends."""

    name = models.CharField(
        max_length=200,
        verbose_name="Nome",
    )
    slug = models.SlugField(
        unique=True,
        verbose_name="Slug",
    )
    region = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Regiao",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Criado em",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="Atualizado em",
    )

    class Meta:
        verbose_name = "Liga"
        verbose_name_plural = "Ligas"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Team(models.Model):
    """Time profissional de eSports."""

    name = models.CharField(
        max_length=200,
        verbose_name="Nome",
    )
    slug = models.SlugField(
        unique=True,
        verbose_name="Slug",
    )
    oe_teamid = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
        verbose_name="ID Oracle's Elixir",
        help_text="Identificador unico do time no Oracle's Elixir para deduplicacao.",
    )
    short_name = models.CharField(
        max_length=20,
        blank=True,
        verbose_name="Abreviacao",
    )
    leagues = models.ManyToManyField(
        League,
        blank=True,
        related_name="teams",
        verbose_name="Ligas",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Criado em",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="Atualizado em",
    )

    class Meta:
        verbose_name = "Time"
        verbose_name_plural = "Times"
        ordering = ["name"]

    def __str__(self) -> str:
        if self.short_name:
            return f"{self.name} ({self.short_name})"
        return self.name


class Player(models.Model):
    """Jogador profissional de League of Legends."""

    POSITION_CHOICES = [
        ("top", "Top"),
        ("jng", "Jungle"),
        ("mid", "Mid"),
        ("bot", "Bot"),
        ("sup", "Support"),
    ]

    name = models.CharField(
        max_length=200,
        verbose_name="Nome (in-game)",
    )
    oe_playerid = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
        verbose_name="ID Oracle's Elixir",
        help_text="Identificador unico do jogador no Oracle's Elixir.",
    )
    position = models.CharField(
        max_length=20,
        choices=POSITION_CHOICES,
        verbose_name="Posicao",
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="players",
        verbose_name="Time",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Criado em",
    )

    class Meta:
        verbose_name = "Jogador"
        verbose_name_plural = "Jogadores"
        ordering = ["name"]

    def __str__(self) -> str:
        position_label = self.get_position_display()
        return f"{self.name} ({position_label})"


class Match(models.Model):
    """Partida individual de League of Legends."""

    gameid = models.CharField(
        max_length=200,
        unique=True,
        verbose_name="ID do Jogo",
        help_text="Identificador unico da partida no Oracle's Elixir.",
    )
    league = models.ForeignKey(
        League,
        on_delete=models.CASCADE,
        related_name="matches",
        verbose_name="Liga",
    )
    year = models.IntegerField(
        verbose_name="Ano",
    )
    split = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Split",
        help_text="Spring, Summer, etc.",
    )
    patch = models.CharField(
        max_length=20,
        blank=True,
        verbose_name="Patch",
    )
    date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Data",
    )
    blue_team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="blue_side_matches",
        verbose_name="Time Azul",
    )
    red_team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="red_side_matches",
        verbose_name="Time Vermelho",
    )
    winner = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="won_matches",
        verbose_name="Vencedor",
    )
    game_length = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Duracao (minutos)",
    )
    playoffs = models.BooleanField(
        default=False,
        verbose_name="Playoffs",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Criado em",
    )

    class Meta:
        verbose_name = "Partida"
        verbose_name_plural = "Partidas"
        ordering = ["-date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.blue_team} vs {self.red_team} ({self.gameid})"


class TeamMatchStats(models.Model):
    """Estatisticas de um time em uma partida especifica (2 registros por partida)."""

    SIDE_CHOICES = [
        ("Blue", "Azul"),
        ("Red", "Vermelho"),
    ]

    match = models.ForeignKey(
        Match,
        on_delete=models.CASCADE,
        related_name="team_stats",
        verbose_name="Partida",
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="match_stats",
        verbose_name="Time",
    )
    side = models.CharField(
        max_length=4,
        choices=SIDE_CHOICES,
        verbose_name="Lado",
    )
    is_winner = models.BooleanField(
        default=False,
        verbose_name="Vencedor",
    )

    # Combat stats
    kills = models.IntegerField(
        default=0,
        verbose_name="Abates",
    )
    deaths = models.IntegerField(
        default=0,
        verbose_name="Mortes",
    )
    assists = models.IntegerField(
        default=0,
        verbose_name="Assistencias",
    )
    total_gold = models.FloatField(
        default=0,
        verbose_name="Ouro Total",
    )

    # Objective stats
    dragons = models.IntegerField(
        default=0,
        verbose_name="Dragoes",
    )
    barons = models.IntegerField(
        default=0,
        verbose_name="Baroes",
    )
    towers = models.IntegerField(
        default=0,
        verbose_name="Torres",
    )
    heralds = models.IntegerField(
        default=0,
        verbose_name="Arautos",
    )
    voidgrubs = models.IntegerField(
        default=0,
        verbose_name="Voidgrubs",
    )
    inhibitors = models.IntegerField(
        default=0,
        verbose_name="Inibidores",
    )

    # First objectives
    first_blood = models.BooleanField(
        default=False,
        verbose_name="Primeiro Sangue",
    )
    first_dragon = models.BooleanField(
        default=False,
        verbose_name="Primeiro Dragao",
    )
    first_herald = models.BooleanField(
        default=False,
        verbose_name="Primeiro Arauto",
    )
    first_baron = models.BooleanField(
        default=False,
        verbose_name="Primeiro Barao",
    )
    first_tower = models.BooleanField(
        default=False,
        verbose_name="Primeira Torre",
    )
    first_inhibitor = models.BooleanField(
        default=False,
        verbose_name="Primeiro Inibidor",
    )

    # Differential stats at early game
    golddiffat10 = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Diferenca de Ouro aos 10min",
    )
    golddiffat15 = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Diferenca de Ouro aos 15min",
    )
    xpdiffat10 = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Diferenca de XP aos 10min",
    )
    xpdiffat15 = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Diferenca de XP aos 15min",
    )
    csdiffat10 = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Diferenca de CS aos 10min",
    )
    csdiffat15 = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Diferenca de CS aos 15min",
    )

    class Meta:
        verbose_name = "Estatistica do Time na Partida"
        verbose_name_plural = "Estatisticas dos Times nas Partidas"
        unique_together = [["match", "team"]]

    def __str__(self) -> str:
        result = "W" if self.is_winner else "L"
        return f"{self.team} ({self.side}) - {result} - {self.match.gameid}"


class PlayerMatchStats(models.Model):
    """Estatisticas de um jogador em uma partida especifica (10 registros por partida)."""

    match = models.ForeignKey(
        Match,
        on_delete=models.CASCADE,
        related_name="player_stats",
        verbose_name="Partida",
    )
    player = models.ForeignKey(
        Player,
        on_delete=models.CASCADE,
        related_name="match_stats",
        verbose_name="Jogador",
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="player_match_stats",
        verbose_name="Time",
    )
    position = models.CharField(
        max_length=20,
        verbose_name="Posicao",
    )
    champion = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Campeao",
    )

    # Combat stats
    kills = models.IntegerField(
        default=0,
        verbose_name="Abates",
    )
    deaths = models.IntegerField(
        default=0,
        verbose_name="Mortes",
    )
    assists = models.IntegerField(
        default=0,
        verbose_name="Assistencias",
    )

    # Economy stats
    cs = models.FloatField(
        default=0,
        verbose_name="CS Total",
        help_text="Total de minions e monstros abatidos.",
    )
    total_gold = models.FloatField(
        default=0,
        verbose_name="Ouro Total",
    )

    # Performance stats
    damage_to_champions = models.FloatField(
        default=0,
        verbose_name="Dano a Campeoes",
    )
    vision_score = models.FloatField(
        default=0,
        verbose_name="Pontuacao de Visao",
    )
    wards_placed = models.IntegerField(
        default=0,
        verbose_name="Sentinelas Colocadas",
    )
    wards_destroyed = models.IntegerField(
        default=0,
        verbose_name="Sentinelas Destruidas",
    )

    # Calculated stats
    kda = models.FloatField(
        default=0,
        verbose_name="KDA",
    )
    cs_per_min = models.FloatField(
        default=0,
        verbose_name="CS por Minuto",
    )
    gold_per_min = models.FloatField(
        default=0,
        verbose_name="Ouro por Minuto",
    )
    damage_per_min = models.FloatField(
        default=0,
        verbose_name="Dano por Minuto",
    )

    class Meta:
        verbose_name = "Estatistica do Jogador na Partida"
        verbose_name_plural = "Estatisticas dos Jogadores nas Partidas"
        unique_together = [["match", "player"]]

    def __str__(self) -> str:
        return f"{self.player.name} ({self.champion}) - {self.match.gameid}"


class TeamEloRating(models.Model):
    """Rating ELO de um time em uma liga especifica."""

    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="elo_ratings",
        verbose_name="Time",
    )
    league = models.ForeignKey(
        League,
        on_delete=models.CASCADE,
        related_name="elo_ratings",
        verbose_name="Liga",
    )
    elo_rating = models.FloatField(
        default=1500.0,
        verbose_name="ELO Rating",
    )
    elo_rating_blue = models.FloatField(
        default=1500.0,
        verbose_name="ELO (Blue Side)",
    )
    elo_rating_red = models.FloatField(
        default=1500.0,
        verbose_name="ELO (Red Side)",
    )
    matches_played = models.IntegerField(
        default=0,
        verbose_name="Partidas Jogadas",
    )
    last_change = models.FloatField(
        default=0.0,
        verbose_name="Ultima Variacao",
    )
    last_change_blue = models.FloatField(
        default=0.0,
        verbose_name="Var. Blue",
    )
    last_change_red = models.FloatField(
        default=0.0,
        verbose_name="Var. Red",
    )
    last_match_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Data da Ultima Partida",
    )

    class Meta:
        verbose_name = "ELO Rating"
        verbose_name_plural = "ELO Ratings"
        ordering = ["-elo_rating"]
        unique_together = ("team", "league")

    def __str__(self) -> str:
        return f"{self.team.name} ({self.league.name}) - ELO {self.elo_rating:.0f}"


class DataImportLog(models.Model):
    """Registro de importacao de dados do Oracle's Elixir."""

    STATUS_CHOICES = [
        ("pending", "Pendente"),
        ("processing", "Processando"),
        ("completed", "Concluido"),
        ("failed", "Falhou"),
    ]

    year = models.IntegerField(
        verbose_name="Ano",
    )
    source = models.CharField(
        max_length=200,
        verbose_name="Fonte",
    )
    rows_processed = models.IntegerField(
        default=0,
        verbose_name="Linhas Processadas",
    )
    matches_created = models.IntegerField(
        default=0,
        verbose_name="Partidas Criadas",
    )
    matches_skipped = models.IntegerField(
        default=0,
        verbose_name="Partidas Ignoradas",
    )
    errors = models.TextField(
        blank=True,
        verbose_name="Erros",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
        verbose_name="Status",
    )
    started_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Iniciado em",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Concluido em",
    )

    class Meta:
        verbose_name = "Log de Importacao"
        verbose_name_plural = "Logs de Importacao"
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"Importacao {self.year} - {self.get_status_display()} ({self.source})"


class LiveMatchSnapshot(models.Model):
    """Snapshot temporario do ultimo estado de um jogo ao vivo.

    Quando um jogo termina, a API Livestats para de retornar dados reais.
    Este modelo preserva o ultimo estado conhecido para uso como fallback
    ate que os dados do Oracle's Elixir sejam importados.
    """

    esports_game_id = models.CharField(
        max_length=50,
        unique=True,
        verbose_name="Game ID (LoL Esports)",
        help_text="ID do jogo na API LoL Esports.",
    )
    blue_team_code = models.CharField(
        max_length=20,
        verbose_name="Codigo Time Azul",
    )
    red_team_code = models.CharField(
        max_length=20,
        verbose_name="Codigo Time Vermelho",
    )
    blue_team_name = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Nome Time Azul",
    )
    red_team_name = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Nome Time Vermelho",
    )
    blue_team_db_id = models.IntegerField(
        null=True,
        blank=True,
        verbose_name="ID DB Time Azul",
        help_text="FK para Team.id (nao FK real para evitar dependencia).",
    )
    red_team_db_id = models.IntegerField(
        null=True,
        blank=True,
        verbose_name="ID DB Time Vermelho",
        help_text="FK para Team.id (nao FK real para evitar dependencia).",
    )
    match_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Data da Partida",
    )
    draft_data = models.JSONField(
        null=True,
        blank=True,
        verbose_name="Draft",
        help_text="Dict com picks: {'blue_top': 'Ksante', ...}",
    )
    final_stats = models.JSONField(
        null=True,
        blank=True,
        verbose_name="Stats Finais",
        help_text="Dict com kills, gold, towers, dragons, barons por lado.",
    )
    players_data = models.JSONField(
        null=True,
        blank=True,
        verbose_name="Dados dos Jogadores",
        help_text="Dict com {'blue': [...], 'red': [...]} jogadores.",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Criado em",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="Atualizado em",
    )

    class Meta:
        verbose_name = "Snapshot de Jogo ao Vivo"
        verbose_name_plural = "Snapshots de Jogos ao Vivo"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.blue_team_code} vs {self.red_team_code} ({self.esports_game_id})"
