pipeline {
    agent any

    parameters {
        choice(
            name: 'PIPELINE_ACTION',
            choices: ['docker-only', 'terraform-plan', 'terraform-apply', 'terraform-destroy', 'full-deploy'],
            description: 'Select pipeline action'
        )
    }

    environment {
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
        DOCKERHUB_USERNAME = 'mennaomar12'
        CLIENT_IMAGE = "${DOCKERHUB_USERNAME}/hotel-client"
        SERVER_IMAGE = "${DOCKERHUB_USERNAME}/hotel-server"
        IMAGE_TAG = "${BUILD_NUMBER}"

        VITE_BACKEND_URL = 'http://localhost:3000'
        VITE_CURRENCY = '$'
        CLERK_KEY = credentials('clerk-publishable-key')
        STRIPE_KEY = credentials('stripe-publishable-key')

        AWS_DEFAULT_REGION = 'us-east-1'

        TF_VAR_backend_image = "${SERVER_IMAGE}:latest"
        TF_VAR_frontend_image = "${CLIENT_IMAGE}:latest"
    }

    stages {

        stage('Checkout') {
            steps {
                echo '📥 Checking out code...'
                checkout scm
            }
        }

        stage('Verify Structure') {
            steps {
                echo '📂 Checking repository structure...'
                sh '''
                    ls -la
                    [ -d client ] && echo "Client found" || echo "Client NOT found"
                    [ -d server ] && echo "Server found" || echo "Server NOT found"
                    [ -d terraform ] && echo "Terraform found" || echo "Terraform NOT found"
                '''
            }
        }

        stage('Build Client Image') {
            when { expression { params.PIPELINE_ACTION in ['docker-only', 'full-deploy'] } }
            steps {
                echo '🔨 Building Client Image...'
                dir('client') {
                    sh """
                        docker build \
                            --build-arg VITE_BACKEND_URL=${VITE_BACKEND_URL} \
                            --build-arg VITE_CURRENCY=${VITE_CURRENCY} \
                            --build-arg VITE_CLERK_PUBLISHABLE_KEY=${CLERK_KEY} \
                            --build-arg VITE_STRIPE_PUBLISHABLE_KEY=${STRIPE_KEY} \
                            -t ${CLIENT_IMAGE}:${IMAGE_TAG} \
                            -t ${CLIENT_IMAGE}:latest .
                    """
                }
            }
        }

        stage('Build Server Image') {
            when { expression { params.PIPELINE_ACTION in ['docker-only', 'full-deploy'] } }
            steps {
                echo '🔨 Building Server Image...'
                dir('server') {
                    sh """
                        docker build \
                            -t ${SERVER_IMAGE}:${IMAGE_TAG} \
                            -t ${SERVER_IMAGE}:latest .
                    """
                }
            }
        }

        stage('Security Scan') {
            when { expression { params.PIPELINE_ACTION in ['docker-only', 'full-deploy'] } }
            steps {
                echo '🔍 Scanning Images with Trivy...'
                sh """
                    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                        aquasec/trivy:latest image ${SERVER_IMAGE}:latest
                """

                sh """
                    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                        aquasec/trivy:latest image ${CLIENT_IMAGE}:latest
                """
            }
        }

        stage('Test Containers') {
            when { expression { params.PIPELINE_ACTION in ['docker-only', 'full-deploy'] } }
            steps {
                echo '🧪 Testing Backend Container...'
                sh """
                    docker run -d --name test-backend -p 3000:3000 \
                        -e CLERK_PUBLISHABLE_KEY=test \
                        -e CLERK_SECRET_KEY=test \
                        -e MONGODB_URI=mongodb://test:test@localhost:27017/test \
                        ${SERVER_IMAGE}:latest

                    sleep 10
                    curl -f http://localhost:3000/health || echo 'Health check failed'
                    docker stop test-backend
                    docker rm test-backend
                """
            }
        }

        stage('Login to DockerHub') {
            when { expression { params.PIPELINE_ACTION in ['docker-only', 'full-deploy'] } }
            steps {
                sh """
                    echo ${DOCKERHUB_CREDENTIALS_PSW} | docker login -u ${DOCKERHUB_CREDENTIALS_USR} --password-stdin
                """
            }
        }

        stage('Push Images') {
            when { expression { params.PIPELINE_ACTION in ['docker-only', 'full-deploy'] } }
            steps {
                sh """
                    docker push ${CLIENT_IMAGE}:${IMAGE_TAG}
                    docker push ${CLIENT_IMAGE}:latest
                    docker push ${SERVER_IMAGE}:${IMAGE_TAG}
                    docker push ${SERVER_IMAGE}:latest
                """
            }
        }

        stage('Clean Docker') {
            when { expression { params.PIPELINE_ACTION in ['docker-only', 'full-deploy'] } }
            steps {
                sh """
                    docker rmi ${CLIENT_IMAGE}:${IMAGE_TAG} || true
                    docker rmi ${CLIENT_IMAGE}:latest || true
                    docker rmi ${SERVER_IMAGE}:${IMAGE_TAG} || true
                    docker rmi ${SERVER_IMAGE}:latest || true
                    docker system prune -f || true
                """
            }
        }

        // ============ TERRAFORM ============

        stage('Terraform Init') {
            when { expression { params.PIPELINE_ACTION != 'docker-only' } }
            steps {
                dir('terraform') {
                    withCredentials([
                        string(credentialsId:'aws-access-key-id', variable:'AWS_ACCESS_KEY_ID'),
                        string(credentialsId:'aws-secret-access-key', variable:'AWS_SECRET_ACCESS_KEY')
                    ]) {
                        sh """
                            export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
                            export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
                            terraform init -upgrade
                        """
                    }
                }
            }
        }

        stage('Terraform Validate') {
            when { expression { params.PIPELINE_ACTION != 'docker-only' } }
            steps {
                dir('terraform') {
                    sh "terraform validate"
                }
            }
        }

        stage('Terraform Plan') {
            when { expression { params.PIPELINE_ACTION in ['terraform-plan','terraform-apply','full-deploy'] } }
            steps {
                dir('terraform') {
                    sh """
                        terraform plan -out=tfplan
                    """
                }
            }
        }

        stage('Terraform Apply') {
            when { expression { params.PIPELINE_ACTION in ['terraform-apply','full-deploy'] } }
            steps {
                input message: 'Deploy Terraform?', ok: 'Apply'
                dir('terraform') {
                    sh "terraform apply -auto-approve tfplan"
                }
            }
        }

        stage('Configure kubectl') {
            when { expression { params.PIPELINE_ACTION in ['terraform-apply','full-deploy'] } }
            steps {
                dir('terraform') {
                    sh """
                        CLUSTER=$(terraform output -raw cluster_name)
                        aws eks update-kubeconfig --region us-east-1 --name $CLUSTER
                    """
                }
            }
        }

        stage('Deploy Security Policies') {
            when { expression { params.PIPELINE_ACTION in ['terraform-apply','full-deploy'] } }
            steps {
                dir('k8s') {
                    sh """
                        kubectl apply -f security/network-policies.yaml -n hotel-app
                        kubectl apply -f security/pod-security.yaml -n hotel-app
                        kubectl apply -f auto-scaling/hpa.yaml -n hotel-app
                    """
                }
            }
        }

        stage('Verify Deployment') {
            when { expression { params.PIPELINE_ACTION in ['terraform-apply','full-deploy'] } }
            steps {
                sh """
                    kubectl get pods -n hotel-app
                    kubectl get svc -n hotel-app
                    kubectl get ingress -n hotel-app
                """
            }
        }

        stage('Terraform Destroy') {
            when { expression { params.PIPELINE_ACTION == 'terraform-destroy' } }
            steps {
                input message: 'Destroy ALL resources?', ok: 'Destroy'
                dir('terraform') {
                    sh "terraform destroy -auto-approve"
                }
            }
        }
    }

    post {
        always {
            echo "🏁 Pipeline finished."
        }
        success {
            echo "✅ SUCCESS"
        }
        failure {
            echo "❌ FAILED"
        }
    }
}
