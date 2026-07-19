package fleaflicker

type Sport string

const (
	SportNFL Sport = "NFL"
	SportMLB Sport = "MLB"
	SportNBA Sport = "NBA"
	SportNHL Sport = "NHL"
)

// StandingsResponse represents the response from FetchLeagueStandings
type StandingsResponse struct {
	Divisions []Division `json:"divisions"`
	Season    int        `json:"season"`
	League    League     `json:"league"`
}

type Division struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Teams []Team `json:"teams"`
}

type Team struct {
	ID                     int            `json:"id"`
	Name                   string         `json:"name"`
	RecordOverall          Record         `json:"recordOverall"`
	PointsFor              FormattedValue `json:"pointsFor"`
	PointsAgainst          FormattedValue `json:"pointsAgainst"`
	Streak                 FormattedValue `json:"streak"`
	WaiverPosition         int            `json:"waiverPosition"`
	WaiverAcquisitionBudget FormattedValue `json:"waiverAcquisitionBudget"`
	Owners                 []Owner        `json:"owners"`
}

type Record struct {
	Wins          int            `json:"wins"`
	Losses        int            `json:"losses"`
	Ties          int            `json:"ties"`
	WinPercentage FormattedValue `json:"winPercentage"`
	Rank          int            `json:"rank"`
	Formatted     string         `json:"formatted"`
}

type FormattedValue struct {
	Value     float64 `json:"value"`
	Formatted string  `json:"formatted"`
}

type Owner struct {
	ID          int    `json:"id"`
	DisplayName string `json:"displayName"`
}

type League struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// RostersResponse represents the response from FetchLeagueRosters
type RostersResponse struct {
	Rosters []Roster `json:"rosters"`
}

type Roster struct {
	Team    Team     `json:"team"`
	Players []Player `json:"players"`
}

type Player struct {
	ProPlayer ProPlayer `json:"proPlayer"`
}

type ProPlayer struct {
	ID                  int      `json:"id"`
	NameFull            string   `json:"nameFull"`
	NameShort           string   `json:"nameShort"`
	Position            string   `json:"position"`
	ProTeamAbbreviation string   `json:"proTeamAbbreviation"`
	ByeWeek             int      `json:"nflByeWeek"`
	PositionEligibility []string `json:"positionEligibility"`
}

// ActivityResponse represents the response from FetchLeagueActivity
type ActivityResponse struct {
	Items            []ActivityItem `json:"items"`
	ResultOffsetNext int            `json:"resultOffsetNext"`
	ResultTotal      int            `json:"resultTotal"`
}

type ActivityItem struct {
	TimeEpochMilli string         `json:"timeEpochMilli"`
	Transaction    *Transaction   `json:"transaction,omitempty"`
	ReserveChange  *ReserveChange `json:"reserveChange,omitempty"`
}

type Transaction struct {
	Type   string `json:"type"`
	Player Player `json:"player"`
	Team   Team   `json:"team"`
}

type ReserveChange struct {
	Player  Player `json:"player"`
	Team    Team   `json:"team"`
	Removed bool   `json:"removed"`
}
