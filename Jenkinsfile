// Declarative pipeline: Checkout -> Test -> Build Images -> Deploy -> Smoke Test
pipeline {
  agent any

  environment {
    COMPOSE_PROJECT_NAME = 'pokemonteam'
    TAG = "${env.BUILD_NUMBER}"          // every image is tagged with the build number
  }

  triggers {
    // Automatic trigger: Jenkins checks the repository every 2 minutes and
    // starts a build when there is a new commit. (A GitHub webhook also works.)
    pollSCM('H/2 * * * *')
  }

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Test') {
      steps {
        // Runs the "test" stage of each Dockerfile. If any test fails, this
        // stage fails and the pipeline STOPS here: nothing gets deployed.
        sh 'docker build --target test -t pokemonteam/team-api:test ./team-api'
        sh 'docker build --target test -t pokemonteam/lookup-service:test ./lookup-service'
      }
    }

    stage('Build Images') {
      steps {
        withCredentials([file(credentialsId: 'pokemonteam-env', variable: 'ENV_FILE')]) {
          sh 'cp "$ENV_FILE" .env'
          sh 'docker compose build'
        }
      }
    }

    stage('Deploy') {
      steps {
        withCredentials([file(credentialsId: 'pokemonteam-env', variable: 'ENV_FILE')]) {
          sh 'cp "$ENV_FILE" .env'
          sh 'docker compose up -d --no-build --remove-orphans'
        }
      }
    }

    stage('Smoke Test') {
      steps {
        sh '''
          for i in $(seq 1 12); do
            if docker compose exec -T team-api wget -qO- http://localhost:3000/health \
            && docker compose exec -T lookup-service wget -qO- http://localhost:4000/health \
            && docker compose exec -T proxy wget -qO- http://127.0.0.1:8080/api/pokemon > /dev/null \
            && docker compose exec -T proxy wget -qO- http://127.0.0.1:8080/version.json; then
              echo; echo "Smoke test passed"; exit 0
            fi
            echo "Waiting for services..."; sleep 5
          done
          echo "Smoke test failed"; exit 1
        '''
      }
    }
  }

  post {
    success { echo "Pokemon Team Tracker build ${TAG} is live at http://127.0.0.1:8080" }
    failure { echo "Build ${TAG} failed. See the stage logs. To roll back run: TAG=<previous build number> docker compose -p pokemonteam up -d --no-build" }
    always  { sh 'rm -f .env' }   // never leave secrets in the workspace
  }
}
