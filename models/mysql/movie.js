import mysql from 'mysql2/promise'

const DEFAULT_CONFIG = {
  host: '127.0.0.1',
  user: 'root',
  port: 3306,
  password: '',
  database: 'moviesdb'
}

// const PROD_CONFIG = {
//   host: process.env.DATABASE_HOST,
//   user: process.env.DATABASE_USERNAME,
//   port: process.env.PORT,
//   password: process.env.DATABASE_PASSWORD,
//   database: process.env.DATABASE_NAME
// }

const connectionString = process.env.DATABASE_URL ?? DEFAULT_CONFIG

const connection = await mysql.createConnection(connectionString)

export class MovieModel {
  static async getAll ({ genre }) {
    let query = 'SELECT title, year, director, duration, poster, rate, BIN_TO_UUID(movies.id) id FROM movies'

    if (genre) {
      const lowerCaseGenre = genre.toLowerCase()
      query += ' INNER JOIN movie_genres ON movies.id = movie_genres.movie_id INNER JOIN genres ON movie_genres.genre_id = genres.id WHERE LOWER(genres.name) = ?;'
      const [moviesWithGenre] = await connection.query(query, [lowerCaseGenre])

      if (moviesWithGenre.length === 0) return []

      return moviesWithGenre
    }

    const [movies] = await connection.query(query)

    return movies
  }

  static async getById ({ id }) {
    const [movies] = await connection.query(
      'SELECT title, year, director, duration, poster, rate, BIN_TO_UUID(movies.id) id FROM movies WHERE id = UUID_TO_BIN(?);',
      [id]
    )

    if (movies.length === 0) return null

    return movies[0]
  }

  static async create ({ input }) {
    const {
      genre: genreInput,
      title,
      year,
      director,
      duration,
      poster,
      rate
    } = input

    const [uuidResult] = await connection.query('SELECT UUID() uuid;')
    const [{ uuid }] = uuidResult

    // Aquí no hay SQL Injection porque el uuid se genera en el back, no hay entrada del usuario.
    // Por eso se puede pasar así el uuid.
    const insertQuery = `INSERT INTO movies (id, title, year, director, duration, poster, rate) VALUES (UUID_TO_BIN('${uuid}'), ?, ?, ?, ?, ?, ?);`

    // Query para añadir el genero de la película a la tabla movie_genres.
    const genreQuery = 'INSERT INTO movie_genres (movie_id, genre_id) VALUES ((SELECT id FROM movies WHERE title = ?), (SELECT id FROM genres WHERE name = ?));'

    try {
      await connection.query(insertQuery, [title, year, director, duration, poster, rate])

      genreInput.map(async (genero) => {
        await connection.query(genreQuery, [title, genero])
      })
    } catch (error) {
      throw new Error('Creating movie error')
    }

    // Query para devolver la película añadida.
    const movieQuery = 'SELECT title, year, director, duration, poster, rate, BIN_TO_UUID(movies.id) id FROM movies WHERE id = UUID_TO_BIN(?);'

    const [movie] = await connection.query(movieQuery, [uuid])

    return movie[0]
  }

  static async delete ({ id }) {
    const deleteQuery = 'DELETE FROM movies WHERE id = UUID_TO_BIN(?);'
    const deleteGenre = 'DELETE FROM movie_genres WHERE movie_id = UUID_TO_BIN(?);'
    const deletedMovie = 'SELECT * FROM movies WHERE id = UUID_TO_BIN(?);'

    const [movie] = await connection.query(deletedMovie, [id])

    if (movie.length === 0) return false

    await connection.query(deleteQuery, [id])
    await connection.query(deleteGenre, [id])

    return true
  }

  static async update ({ id, input }) {
    const [movie] = await connection.query(
      'SELECT title, year, director, duration, poster, rate, BIN_TO_UUID(movies.id) id FROM movies WHERE id = UUID_TO_BIN(?);',
      [id]
    )

    if (movie.length === 0) return null

    const {
      genre: genreInput,
      title,
      year,
      director,
      duration,
      poster,
      rate
    } = input

    const updateQuery = 'UPDATE movies SET title = ?, year = ?, director = ?, duration = ?, poster = ?, rate = ? WHERE id = UUID_TO_BIN(?);'
    await connection.query(updateQuery, [title ?? '', year ?? '', director ?? '', duration ?? '', poster ?? '', rate ?? 5])

    if (genreInput) {
      const deleteGenre = 'DELETE FROM movie_genres WHERE movie_id = UUID_TO_BIN(?);'
      await connection.query(deleteGenre, [id])
      const genreQuery = 'INSERT INTO movie_genres (movie_id, genre_id) VALUES ((SELECT id FROM movies WHERE title = ?), (SELECT id FROM genres WHERE name = ?));'
      await connection.query(genreQuery, [title ?? '', genreInput ?? ''])
    }

    const [movies] = await connection.query('SELECT * FROM movies')

    return movies[0]
  }
}
