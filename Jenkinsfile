pipeline {
    agent any

    environment {
        DOCKERHUB_REPO = "mennaomar12/hotel-app"
    }

    parameters {
        choice(
            name: 'PIPELINE_ACTION',
            choices: [
                'build-only',
                'docker-build',
                'terraform-init',
                'terraform-apply',
                'full-deploy',
                'terraform-destroy'
            ],
            description: 'Choose pipeline action'
        )
    }

    stages {

        stage('Checkout Code') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/abd-elrahman-mohamed-anter/project-2.git'
                    ]]
                ])
            }
        }

        stage('Build Node.js App') {
            when { expression { params.PIPELINE_ACTION in ['build-only','docker-build','full-deploy'] } }
            steps {
                echo "📦 Installing Node.js dependencies"
                sh '''
                    npm install
                    # Optional if project has a build script
                    npm run build || echo "No build command found — skipping"
                '''
            }
        }

        stage('Docker Build & Push') {
            when { expression { params.PIPELINE_ACTION in ['docker-build','full-deploy'] } }
            steps {
                script {
                    docker.withRegistry('https://index.docker.io/v1/', 'dockerhub-credentials') {
                        sh """
                            echo 🐳 Building Docker image...
                            docker build -t ${DOCKERHUB_REPO}:${BUILD_NUMBER} .

                            echo 📤 Pushing image to Docker Hub...
                            docker push ${DOCKERHUB_REPO}:${BUILD_NUMBER}
                        """
                    }
                }
            }
        }

        stage('Terraform Init & Apply') {
            when { expression { params.PIPELINE_ACTION in ['terraform-init','terraform-apply','full-deploy'] } }
            steps {
                dir('terraform') {
                    sh """
                        terraform init -upgrade
                        terraform apply -auto-approve
                    """
                }
            }
        }

        stage('Configure kubectl') {
            when { expression { params.PIPELINE_ACTION == 'full-deploy' } }
            steps {
                dir('terraform') {
                    sh """
                        CLUSTER=$(terraform output -raw cluster_name)
                        aws eks update-kubeconfig --region us-east-1 --name $CLUSTER
                    """
                }
            }
        }

        stage('Kubernetes Deploy') {
            when { expression { params.PIPELINE_ACTION == 'full-deploy' } }
            steps {
                sh """
                    kubectl apply -f k8s/deployment.yaml -n hotel-app
                    kubectl apply -f k8s/service.yaml -n hotel-app
                    kubectl apply -f k8s/ingress.yaml -n hotel-app
                """
            }
        }

        stage('Apply Security Policies') {
            when { expression { params.PIPELINE_ACTION == 'full-deploy' } }
            steps {
                sh """
                    kubectl apply -f k8s/security/network-policies.yaml -n hotel-app
                    kubectl apply -f k8s/security/pod-security.yaml -n hotel-app
                    kubectl apply -f k8s/auto-scaling/hpa.yaml -n hotel-app
                """
            }
        }

        stage('Verify Deployment') {
            when { expression { params.PIPELINE_ACTION == 'full-deploy' } }
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
                input message: 'Are you sure you want to DESTROY all resources?', ok: 'Destroy'
                dir('terraform') {
                    sh "terraform destroy -auto-approve"
                }
            }
        }
    }

    post {
        always { echo "🏁 Pipeline finished." }
        success { echo "✅ SUCCESS" }
        failure { echo "❌ FAILED" }
    }
}
